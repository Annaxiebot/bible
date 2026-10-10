/**
 * AskAIOverlayHistory.test.tsx — the TV Ask AI with saved history (ADR-0021) · 问一问记录浮层测试
 *
 * The session (services/supabase) and the history data calls (askHistory)
 * are mocked; the answer stream is streamStudyAI. Owned study: saved
 * exchanges come back oldest first before an auto-sent question, and go
 * with it as history; each completed answer is saved; at the limit the
 * notice offers Replace oldest / Don't save; Clear empties the view without
 * deleting; failures are a quiet line. Not owned (another leader's pack,
 * signed out, the demo pack): nothing loads, nothing saves, no Clear.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { TEST_PACK_PATH } from './fixtures';
import { parseStudyPack, buildSlides, StudyPack } from '../packTypes';
import { ASK_AI_MODEL } from '../../../services/aiDefaults';
import { AH_FULL_NOTICE, AH_REPLACE, AH_DONT_SAVE, AH_CLEAR } from '../askHistoryStrings';

const streamStudyAIMock = vi.fn();
vi.mock('../askAIFallback', () => ({ streamStudyAI: (...args: unknown[]) => streamStudyAIMock(...args) }));

let signedInUid: string | null = null;
const authState = () => ({
  user: signedInUid ? { id: signedInUid, email: 'leader@example.com' } : null,
  session: null, isAuthenticated: !!signedInUid, isLoading: false,
});
vi.mock('../../../services/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => true,
  authManager: {
    getState: () => authState(),
    getUserId: () => signedInUid,
    getFullName: () => null,
    subscribe: (l: (s: unknown) => void) => { l(authState()); return () => undefined; },
  },
}));
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => ({}) }));

const listMock = vi.fn();
const saveMock = vi.fn();
vi.mock('../askHistory', async importOriginal => ({
  ...(await importOriginal<typeof import('../askHistory')>()),
  listAskHistory: (...args: unknown[]) => listMock(...args),
  saveAskExchange: (...args: unknown[]) => saveMock(...args),
}));

import AskAIOverlay from '../AskAIOverlay';
import { preloadMarkdown } from '../../LazyMarkdown';

const OWNER = 'uid-owner';
const SAVED = [
  { id: 'r1', pack_id: 'p', question: '旧问题一 Old one', answer: 'Old answer one', model: null, created_at: '2026-10-01T00:00:00Z' },
  { id: 'r2', pack_id: 'p', question: '旧问题二 Old two', answer: 'Old answer two', model: null, created_at: '2026-10-02T00:00:00Z' },
];

function packOwnedBy(leaderId: string | undefined): StudyPack {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  return leaderId ? { ...pack, leaderId } : pack;
}

function renderOverlay(pack: StudyPack, initialQuestion: string | null = 'New question') {
  render(<AskAIOverlay pack={pack} slide={buildSlides(pack)[0]} initialQuestion={initialQuestion} onClose={vi.fn()} />);
}

await preloadMarkdown();

beforeEach(() => {
  streamStudyAIMock.mockReset().mockImplementation(async (_p, _s, _h, _q, onText: (t: string) => void) => {
    onText('Fresh answer (v.25).');
    return { text: 'Fresh answer (v.25).', model: ASK_AI_MODEL };
  });
  listMock.mockReset().mockResolvedValue(SAVED);
  saveMock.mockReset().mockResolvedValue('saved');
  signedInUid = OWNER;
});

describe('AskAIOverlay — saved history on an owned study', () => {
  it('restores the saved exchanges oldest first, before the auto-sent question, and sends them as history', async () => {
    renderOverlay(packOwnedBy(OWNER));
    await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(1));
    expect(listMock).toHaveBeenCalledWith(expect.anything(), expect.any(String), OWNER);
    expect(streamStudyAIMock.mock.calls[0][2]).toEqual([
      { role: 'user', content: SAVED[0].question }, { role: 'assistant', content: SAVED[0].answer },
      { role: 'user', content: SAVED[1].question }, { role: 'assistant', content: SAVED[1].answer },
    ]);
    const earlier = screen.getAllByTestId('ask-earlier-question').map(e => e.textContent);
    expect(earlier).toEqual([expect.stringContaining('旧问题一'), expect.stringContaining('旧问题二')]);
    expect(screen.getByTestId('ask-question')).toHaveTextContent('New question');
  });

  it('saves each completed answer with its question and model', async () => {
    renderOverlay(packOwnedBy(OWNER));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    expect(saveMock.mock.calls[0].slice(1)).toEqual([
      expect.any(String), { question: 'New question', answer: 'Fresh answer (v.25).', model: ASK_AI_MODEL }, false,
    ]);
  });

  it('a failed or empty answer is not saved', async () => {
    streamStudyAIMock.mockRejectedValue(new Error('down'));
    renderOverlay(packOwnedBy(OWNER));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('at the limit: the notice under the answer; Replace oldest saves with replace, the notice goes', async () => {
    saveMock.mockResolvedValueOnce('full').mockResolvedValueOnce('replaced');
    renderOverlay(packOwnedBy(OWNER));
    const notice = await screen.findByTestId('ask-history-full');
    expect(notice).toHaveTextContent(AH_FULL_NOTICE);
    expect(screen.getByTestId('ask-latest')).toContainElement(notice);
    fireEvent.click(screen.getByRole('button', { name: AH_REPLACE }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(2));
    expect(saveMock.mock.calls[1][2]).toMatchObject({ question: 'New question' });
    expect(saveMock.mock.calls[1][3]).toBe(true);
    expect(screen.queryByTestId('ask-history-full')).toBeNull();
  });

  it("at the limit: Don't save closes the notice and saves nothing; the answer stays", async () => {
    saveMock.mockResolvedValueOnce('full');
    renderOverlay(packOwnedBy(OWNER));
    await screen.findByTestId('ask-history-full');
    fireEvent.click(screen.getByRole('button', { name: AH_DONT_SAVE }));
    expect(screen.queryByTestId('ask-history-full')).toBeNull();
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ask-question')).toHaveTextContent('New question');
  });

  it('Clear empties the view (nothing deleted); the next question goes without the old history', async () => {
    renderOverlay(packOwnedBy(OWNER));
    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: AH_CLEAR }));
    expect(screen.queryByTestId('ask-question')).toBeNull();
    expect(screen.queryAllByTestId('ask-earlier-question')).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/Ask AI question/), { target: { value: 'After clear' } });
    fireEvent.submit(screen.getByLabelText(/Ask AI question/).closest('form')!);
    await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(2));
    expect(streamStudyAIMock.mock.calls[1][2]).toEqual([]);
  });

  it('a failed restore or save is one quiet line; the answer still shows', async () => {
    listMock.mockRejectedValue(new Error('读取问一问记录失败 · Could not load the Ask AI history: offline'));
    saveMock.mockRejectedValue(new Error('这条问答未保存 · This answer was not saved: offline'));
    renderOverlay(packOwnedBy(OWNER));
    await waitFor(() => expect(screen.getByTestId('ask-history-problem')).toHaveTextContent('This answer was not saved'));
    expect(screen.getByTestId('ask-history-problem')).toHaveAttribute('role', 'status');
    expect(streamStudyAIMock.mock.calls[0][2]).toEqual([]);
    expect(screen.getByTestId('ask-question')).toHaveTextContent('New question');
  });
});

describe('AskAIOverlay — not owned: in-memory only', () => {
  it.each([
    ["another leader's pack", 'uid-someone-else', OWNER],
    ['signed out', null, OWNER],
    ['the demo pack', OWNER, undefined],
  ] as const)('%s: nothing loads, nothing saves, no Clear', async (_label, uid, leaderId) => {
    signedInUid = uid;
    if (!uid) streamStudyAIMock.mockClear();
    renderOverlay(packOwnedBy(leaderId), uid ? 'New question' : null);
    if (uid) {
      await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(1));
      expect(streamStudyAIMock.mock.calls[0][2]).toEqual([]);
    }
    expect(listMock).not.toHaveBeenCalled();
    expect(saveMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: AH_CLEAR })).toBeNull();
    expect(screen.queryByTestId('ask-history-full')).toBeNull();
  });
});
