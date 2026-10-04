/**
 * SectionAdjust.test.tsx — the "AI 修改 Adjust with AI" box on a section:
 * chips fill the field; Send → busy (dimmed + AI 修改中…) → content replaced
 * through onPatch → 撤销 Undo restores; a later edit drops Undo; failures show
 * in the box. Never offered on scripture / qr / title, nor without the pack.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SectionEditor from '../SectionEditor';
import { adjustSection } from '../adjustSection';
import { PackSection } from '../../studypack/packTypes';
import { AJ_OPEN, AJ_CHIPS, AJ_BUSY, AJ_UNDO, AJ_SEND } from '../adjustStrings';
import { quotaLine } from '../../studypack/tvHints';
import { AskAIError } from '../../studypack/askAIErrors';

vi.mock('../adjustSection', () => ({ adjustSection: vi.fn() }));
const adjust = vi.mocked(adjustSection);

const PACK = { passageRef: '约翰福音 3:22–36 · John 3:22–36', contentLanguage: 'zh-keywords' as const };
const DISCUSSION: PackSection = { kind: 'discussion', heading: '讨论 Discussion', questions: ['旧问题一', '旧问题二'] };

const Host: React.FC<{ initial: PackSection; withPack?: boolean }> = ({ initial, withPack = true }) => {
  const [section, setSection] = useState(initial);
  return <SectionEditor section={section} pack={withPack ? PACK : undefined} onPatch={p => setSection(s => ({ ...s, ...p }))} />;
};

const values = () => screen.getAllByRole('textbox').map(t => (t as HTMLTextAreaElement).value);

beforeEach(() => { adjust.mockReset(); });

describe('SectionAdjust', () => {
  it('chips fill the field; Send → busy → replaced → Undo restores', async () => {
    let finish: (s: PackSection) => void = () => undefined;
    adjust.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<Host initial={DISCUSSION} />);
    fireEvent.click(screen.getByRole('button', { name: `${AJ_OPEN}: ${DISCUSSION.heading}` }));
    const field = screen.getByTestId('ns-adjust-input');
    fireEvent.click(screen.getByRole('button', { name: AJ_CHIPS[0] }));
    expect(field).toHaveValue(AJ_CHIPS[0]);
    fireEvent.click(screen.getByRole('button', { name: AJ_CHIPS[2] }));
    expect(field).toHaveValue(AJ_CHIPS[2]);
    fireEvent.click(screen.getByRole('button', { name: `${AJ_SEND}: ${DISCUSSION.heading}` }));

    expect(await screen.findByText(AJ_BUSY)).toBeInTheDocument();
    expect(screen.getByTestId('ns-questions').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true');
    expect(adjust.mock.calls[0][0]).toMatchObject({ ...PACK, section: DISCUSSION, instruction: AJ_CHIPS[2] });

    finish({ ...DISCUSSION, questions: ['新问题'] });
    await waitFor(() => expect(screen.queryByText(AJ_BUSY)).toBeNull());
    expect(screen.getByLabelText(`${DISCUSSION.heading} 1`)).toHaveValue('新问题');
    expect(screen.queryByTestId('ns-adjust-box')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: `${AJ_UNDO}: ${DISCUSSION.heading}` }));
    expect(values()).toEqual(['旧问题一', '旧问题二']);
    expect(screen.queryByTestId('ns-adjust-undo')).toBeNull();
  });

  it('a later edit of the section drops Undo (one level only)', async () => {
    adjust.mockResolvedValue({ ...DISCUSSION, questions: ['新问题'] });
    render(<Host initial={DISCUSSION} />);
    fireEvent.click(screen.getByTestId('ns-adjust-open'));
    fireEvent.click(screen.getByRole('button', { name: AJ_CHIPS[1] }));
    fireEvent.click(screen.getByTestId('ns-adjust-send'));
    expect(await screen.findByTestId('ns-adjust-undo')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(`${DISCUSSION.heading} 1`), { target: { value: '我自己改的' } });
    expect(screen.queryByTestId('ns-adjust-undo')).toBeNull();
  });

  it('a failure shows its line in the box and leaves the content alone', async () => {
    adjust.mockRejectedValue(new AskAIError('quota', quotaLine(100), 'm', 429));
    render(<Host initial={DISCUSSION} />);
    fireEvent.click(screen.getByTestId('ns-adjust-open'));
    fireEvent.change(screen.getByTestId('ns-adjust-input'), { target: { value: '更短' } });
    fireEvent.click(screen.getByTestId('ns-adjust-send'));
    expect(await screen.findByRole('alert')).toHaveTextContent(quotaLine(100));
    expect(screen.getByTestId('ns-adjust-box')).toBeInTheDocument();
    expect(screen.getByLabelText(`${DISCUSSION.heading} 1`)).toHaveValue('旧问题一');
  });

  it('Send is disabled until there is an instruction', () => {
    render(<Host initial={DISCUSSION} />);
    fireEvent.click(screen.getByTestId('ns-adjust-open'));
    expect(screen.getByTestId('ns-adjust-send')).toBeDisabled();
  });

  it('not offered on scripture, qr or title, nor without the pack', () => {
    const scripture: PackSection = { kind: 'scripture', heading: '经文', verses: [{ num: 22, cuv: '经', en: 'v' }] };
    for (const section of [scripture, { kind: 'qr', heading: 'QR', body: ['x'] }, { kind: 'title', heading: 'T', body: ['x'] }] as PackSection[]) {
      const { unmount } = render(<Host initial={section} />);
      expect(screen.queryByTestId('ns-adjust-open')).toBeNull();
      unmount();
    }
    render(<Host initial={DISCUSSION} withPack={false} />);
    expect(screen.queryByTestId('ns-adjust-open')).toBeNull();
  });
});
