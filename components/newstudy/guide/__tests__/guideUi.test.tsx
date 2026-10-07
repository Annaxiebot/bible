/**
 * guideUi.test.tsx — the study-guide controls · 讲义界面 (ADR-0019)
 *
 * GuideEntry: one quiet text button; a picked PDF is read (opener injected)
 * and handed up with its passage; a scan shows the bilingual message inline.
 * NewStudyForm with a guide: the banner, the passage hint, the dropdowns on
 * the guide's passage, Generate carries the guide, "不用讲义" drops it.
 * SectionEditor in a guide pack: the origin label, the flagged line until it
 * is edited, and "AI 修改" turning a guide section AI-drafted.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { useGeneration } from '../../useGeneration';
import { GuideEntry, passageHint } from '../GuideEntry';
import NewStudyForm from '../../NewStudyForm';
import SectionEditor from '../../SectionEditor';
import { adjustSection } from '../../adjustSection';
import type { PackSection } from '../../../studypack/packTypes';
import type { PdfDocLike } from '../guidePdf';
import type { LoadedGuide } from '../loadGuide';
import { detectGuidePassage } from '../guidePassage';
import { AJ_OPEN, AJ_SEND, AJ_CHIPS } from '../../adjustStrings';
import { NS_GENERATE } from '../../newStudyStrings';
import {
  GD_PICK, GD_ERR_NO_TEXT, GD_LOADED, GD_DROP, GD_PASSAGE_UNSURE, GD_FROM_GUIDE, GD_AI_DRAFTED, notVerbatimLine,
} from '../guideStrings';
import { LOADED_GUIDE, GUIDE_TEXT, GUIDE_REQUEST } from './guideFixtureRequest';
import { GUIDE_QUESTIONS, TIDIED_QUESTION } from './guideFixture';

vi.mock('../../adjustSection', () => ({ adjustSection: vi.fn() }));
vi.mock('../../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({ verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })) }),
}));

/** A pdfjs stand-in whose pages hold the given lines. */
const opener = (pages: string[]) => async (): Promise<PdfDocLike> => ({
  numPages: pages.length,
  getPage: async n => ({ getTextContent: async () => ({ items: [{ str: pages[n - 1], hasEOL: true }] }) }),
  destroy: async () => undefined,
});
/** A picked PDF (jsdom's File has no arrayBuffer(); browsers do). */
const pdf = () => Object.assign(new File(['%PDF'], 'john3.pdf', { type: 'application/pdf' }), {
  arrayBuffer: async () => new TextEncoder().encode('%PDF').buffer,
});

describe('GuideEntry', () => {
  it('one quiet text button; the picked PDF is read and handed up with its passage', async () => {
    const onGuide = vi.fn();
    render(<GuideEntry onGuide={onGuide} open={opener(['约翰福音 3:22-36 查经\n讨论：他必兴旺，我必衰微是什么意思？'])} />);
    expect(screen.getByRole('button', { name: GD_PICK })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('ns-guide-file'), { target: { files: [pdf()] } });
    await waitFor(() => expect(onGuide).toHaveBeenCalledTimes(1));
    expect(onGuide.mock.calls[0][0]).toMatchObject({
      name: 'john3.pdf', pages: 1, passage: { range: { bookId: 'JHN', chapter: 3, verseFrom: 22, verseTo: 36 }, confident: true },
    });
  });

  it('a scan: the bilingual message inline, nothing handed up', async () => {
    const onGuide = vi.fn();
    render(<GuideEntry onGuide={onGuide} open={opener([''])} />);
    fireEvent.change(screen.getByTestId('ns-guide-file'), { target: { files: [pdf()] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(GD_ERR_NO_TEXT);
    expect(onGuide).not.toHaveBeenCalled();
  });
});

describe('NewStudyForm with a guide', () => {
  const JOHN_GUIDE: LoadedGuide = { name: 'john3.pdf', pages: 2, text: 'x', passage: detectGuidePassage('约翰福音 3:22-36') };

  it('banner, passage hint, dropdowns on the guide\'s passage; Generate carries the guide; 不用讲义 drops it', async () => {
    const onGenerate = vi.fn();
    const onDrop = vi.fn();
    render(<NewStudyForm busy={false} onGenerate={onGenerate} guide={JOHN_GUIDE} onDropGuide={onDrop} />);
    expect(screen.getByText(GD_LOADED.replace(/\{name\}/g, 'john3.pdf').replace(/\{n\}/g, '2'))).toBeInTheDocument();
    expect(screen.getByTestId('ns-guide-passage')).toHaveTextContent(passageHint(JOHN_GUIDE));
    expect(screen.getByTestId('ns-guide-passage')).toHaveTextContent('约翰福音 3:22–36 · John 3:22–36');
    expect(screen.getByTestId('ns-book')).toHaveValue('JHN');
    await waitFor(() => expect(screen.getByTestId('ns-verse-from')).toHaveValue('22'));
    fireEvent.click(screen.getByRole('button', { name: NS_GENERATE }));
    expect(onGenerate.mock.calls[0][0]).toMatchObject({ bookId: 'JHN', chapter: 3, verseFrom: 22, verseTo: 36, guide: JOHN_GUIDE });
    fireEvent.click(screen.getByRole('button', { name: GD_DROP }));
    expect(onDrop).toHaveBeenCalled();
  });

  it('no clear passage: asks the leader to choose', () => {
    expect(passageHint({ ...JOHN_GUIDE, passage: { range: null, confident: false } })).toBe(GD_PASSAGE_UNSURE);
    expect(passageHint(LOADED_GUIDE)).toContain('马可福音 1:1–15');
    expect(LOADED_GUIDE.text).toBe(GUIDE_TEXT);
  });
});

describe('useGeneration with a guide', () => {
  it('Cancel returns to the form with the guide still loaded (no second PDF pick)', async () => {
    const cancel = new DOMException('Generation cancelled', 'AbortError');
    vi.spyOn(await import('../../generatePack'), 'generateStudyPack').mockRejectedValue(cancel);
    const setPhase = vi.fn();
    const { result } = renderHook(() => useGeneration(setPhase));
    await act(() => result.current.generate({ ...GUIDE_REQUEST }));
    expect(setPhase).toHaveBeenLastCalledWith({ kind: 'form', guide: LOADED_GUIDE });
  });
});

describe('SectionEditor in a guide pack', () => {
  const PACK = { passageRef: '马可福音 1:1–15 · Mark 1:1–15', contentLanguage: 'zh-keywords' as const };
  const DISCUSSION: PackSection = {
    kind: 'discussion', heading: '讨论 Discussion', origin: 'guide',
    questions: [GUIDE_QUESTIONS[0], TIDIED_QUESTION], notVerbatim: [TIDIED_QUESTION],
  };
  const Host: React.FC<{ initial: PackSection }> = ({ initial }) => {
    const [section, setSection] = useState(initial);
    return (<><SectionEditor section={section} pack={PACK} onPatch={p => setSection(s => ({ ...s, ...p }))} />
      <output data-testid="origin">{section.origin}</output></>);
  };
  beforeEach(() => vi.mocked(adjustSection).mockReset());

  it('labels the section and flags the non-verbatim line until the leader edits it', () => {
    render(<Host initial={DISCUSSION} />);
    expect(screen.getByTestId('ns-origin')).toHaveTextContent(GD_FROM_GUIDE);
    expect(screen.getByTestId('ns-not-verbatim')).toHaveTextContent(notVerbatimLine(TIDIED_QUESTION));
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: GUIDE_QUESTIONS[2] } });
    expect(screen.queryByTestId('ns-not-verbatim')).toBeNull();
  });

  it('an AI section says so; a section with no origin has no label (passage packs unchanged)', () => {
    const { unmount } = render(<Host initial={{ ...DISCUSSION, origin: 'ai', notVerbatim: undefined }} />);
    expect(screen.getByTestId('ns-origin')).toHaveTextContent(GD_AI_DRAFTED);
    unmount();
    render(<Host initial={{ kind: 'discussion', heading: 'h', questions: ['q'] }} />);
    expect(screen.queryByTestId('ns-origin')).toBeNull();
  });

  it('"AI 修改" on a guide section makes it AI-drafted', async () => {
    vi.mocked(adjustSection).mockResolvedValue({ ...DISCUSSION, questions: ['新问题'] });
    render(<Host initial={DISCUSSION} />);
    fireEvent.click(screen.getByRole('button', { name: `${AJ_OPEN}: ${DISCUSSION.heading}` }));
    fireEvent.click(screen.getByRole('button', { name: AJ_CHIPS[0] }));
    fireEvent.click(screen.getByRole('button', { name: `${AJ_SEND}: ${DISCUSSION.heading}` }));
    await waitFor(() => expect(screen.getByTestId('origin')).toHaveTextContent('ai'));
    expect(screen.getByTestId('ns-origin')).toHaveTextContent(GD_AI_DRAFTED);
  });
});
