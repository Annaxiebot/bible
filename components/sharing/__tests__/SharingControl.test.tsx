/**
 * SharingControl.test.tsx — the editor control over a mocked aiTransport · 上周分享控件测试 (ADR-0008)
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SharingControl from '../SharingControl';
import NewStudyEditor from '../../newstudy/NewStudyEditor';
import type { StudyPack } from '../../studypack/packTypes';
import { SH_PREPARE, SH_DONE, SH_DONE_COUNTS_ONLY, SH_NO_PREVIOUS, SHARING_HEADING } from '../sharingStrings';
import { quotaLine } from '../../studypack/tvHints';
import { SIGNUPS_TABLE } from '../../signup/signupSchema';
import { LEADER, PREVIOUS, CURRENT, IDENTIFIERS, GOOD_REPLY, SIGNUPS, defaultClient, fakeClient, sseResponse, makePack } from './fixtures';

const state = vi.hoisted(() => ({
  uid: null as string | null,
  packs: [] as unknown[],
  client: null as unknown,
  replies: [] as Response[],
  sent: [] as Array<{ role: string; body: string }>,
}));

vi.mock('../../../services/aiTransport', () => ({
  hostedUid: () => state.uid,
  sendAIRequest: async (role: string, body: string) => {
    state.sent.push({ role, body });
    return { kind: 'hosted', response: state.replies.shift() };
  },
}));
vi.mock('../../studypack/packSource', async importOriginal => ({
  ...(await importOriginal<object>()),
  listLocalPacks: async () => ({ packs: state.packs, invalid: [] }),
}));
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => state.client }));

beforeEach(() => {
  state.uid = LEADER;
  state.packs = [CURRENT, PREVIOUS, makePack('local-2026-09-25-y', '2026-09-25')];
  state.client = defaultClient().client;
  state.replies = [sseResponse(GOOD_REPLY)];
  state.sent = [];
});

function renderControl(pack: StudyPack = CURRENT) {
  const onApply = vi.fn();
  render(<SharingControl pack={pack} onApply={onApply} />);
  return onApply;
}

describe('SharingControl', () => {
  it('defaults the select to the newest earlier pack and lists the others', async () => {
    renderControl();
    const select = await screen.findByTestId('sh-previous');
    expect(select).toHaveValue(PREVIOUS.id);
    expect(select.querySelectorAll('option')).toHaveLength(2);
  });

  it('Prepare → role "sharing" request without identifiers → the pack with the section after the title', async () => {
    const onApply = renderControl();
    await screen.findByTestId('sh-previous');
    fireEvent.click(screen.getByRole('button', { name: SH_PREPARE }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const applied = onApply.mock.calls[0][0] as StudyPack;
    expect(applied.sections[1]).toMatchObject({ kind: 'sharing', heading: SHARING_HEADING });
    expect(screen.getByTestId('sh-status')).toHaveTextContent(SH_DONE);
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].role).toBe('sharing');
    for (const id of IDENTIFIERS) expect(state.sent[0].body).not.toContain(id);
  });

  it('zero shared answers: counts only, no AI request, and the line says so', async () => {
    state.client = fakeClient({ [SIGNUPS_TABLE]: { data: SIGNUPS, error: null } }).client;
    const onApply = renderControl();
    await screen.findByTestId('sh-previous');
    fireEvent.click(screen.getByRole('button', { name: SH_PREPARE }));
    expect(await screen.findByText(SH_DONE_COUNTS_ONLY)).toBeVisible();
    expect(state.sent).toHaveLength(0);
    expect((onApply.mock.calls[0][0] as StudyPack).sections[1].body).toHaveLength(1);
  });

  it('a quota reply shows the askAIErrors quota line and changes nothing', async () => {
    state.replies = [{ ok: false, status: 429, json: async () => ({ error: 'quota', limit: 10 }) } as unknown as Response];
    const onApply = renderControl();
    await screen.findByTestId('sh-previous');
    fireEvent.click(screen.getByRole('button', { name: SH_PREPARE }));
    expect(await screen.findByRole('alert')).toHaveTextContent(quotaLine(10));
    expect(onApply).not.toHaveBeenCalled();
  });

  it('no other pack: says so and the button is disabled', async () => {
    state.packs = [CURRENT];
    renderControl();
    expect(await screen.findByTestId('sh-none')).toHaveTextContent(SH_NO_PREVIOUS);
    expect(screen.getByRole('button', { name: SH_PREPARE })).toBeDisabled();
  });

  it('signed out: the control is not shown', () => {
    state.uid = null;
    renderControl();
    expect(screen.queryByTestId('sh-control')).toBeNull();
  });
});

describe('NewStudyEditor + SharingControl', () => {
  it('the control sits above the sections; its result reaches onChange (→ auto-save) as section 2', async () => {
    const onChange = vi.fn();
    render(<NewStudyEditor pack={CURRENT} onChange={onChange} onSave={async () => undefined}
      onPreview={async () => undefined} onBack={() => undefined} />);
    const control = screen.getByTestId('sh-control');
    expect(control.compareDocumentPosition(screen.getAllByTestId('ns-section')[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await screen.findByTestId('sh-previous');
    fireEvent.click(screen.getByRole('button', { name: SH_PREPARE }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect((onChange.mock.calls[0][0] as StudyPack).sections.map(s => s.kind)).toEqual(['title', 'sharing', 'scripture', 'context', 'closing']);
  });
});
