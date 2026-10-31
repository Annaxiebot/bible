/**
 * AskAIOverlayHosted.test.tsx — the TV Ask-AI overlay under hosted AI · 本站AI问一问
 *
 * ADR-0007 gate with the session mocked: signed in → no form, asking works;
 * signing in while a question is pending sends it; the hosted no-credit /
 * paused / quota / daily-cap lines carry no link (no own-key hint since
 * 2026-10-23), no Set up AI button, and the limits no Retry. Split from
 * AskAIOverlay.test.tsx (R4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { TEST_PACK_PATH } from './fixtures';
import { parseStudyPack, buildSlides } from '../packTypes';
import { ASK_AI_MODEL } from '../../../services/aiDefaults';
import { SETUP_OPEN_BUTTON } from '../../setup/setupStrings';
import { AI_CREDIT_USED_UP, AI_SERVICE_PAUSED, AI_DAILY_CAP_REACHED, TV_RETRY, quotaLine } from '../tvHints';
import { AskAIError } from '../askAIErrors';

const streamStudyAIMock = vi.fn();
vi.mock('../askAIFallback', () => ({
  streamStudyAI: (...args: unknown[]) => streamStudyAIMock(...args),
}));

// The session, controllable: signing in notifies subscribers like the real authManager.
let signedInUid: string | null = null;
const authListeners = new Set<(s: unknown) => void>();
const authState = () => ({
  user: signedInUid ? { id: signedInUid, email: 'leader@example.com' } : null,
  session: null, isAuthenticated: !!signedInUid, isLoading: false,
});
function signIn(uid: string) {
  signedInUid = uid;
  act(() => authListeners.forEach(l => l(authState())));
}
vi.mock('../../../services/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => true,
  authManager: {
    getState: () => authState(),
    getUserId: () => signedInUid,
    getFullName: () => null,   // read by useLeaderSession (the overlay's saved-history owner check, ADR-0021)
    subscribe: (l: (s: unknown) => void) => { authListeners.add(l); l(authState()); return () => authListeners.delete(l); },
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
}));
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => null }));

import AskAIOverlay from '../AskAIOverlay';
import { preloadMarkdown } from '../../LazyMarkdown';

function renderOverlay(initialQuestion: string | null = null) {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  render(<AskAIOverlay pack={pack} slide={buildSlides(pack)[0]} initialQuestion={initialQuestion} onClose={vi.fn()} />);
}

// Answers render through react-markdown but are not awaited here, so its
// load-dependent first import ran on into the NEXT test and starved it past
// the 10 s test timeout under CPU load. Warm it outside every timed budget
// (see preloadMarkdown() for why top level, not beforeAll).
await preloadMarkdown();

beforeEach(() => {
  streamStudyAIMock.mockReset().mockImplementation(async (_p, _s, _h, _q, onText: (t: string) => void) => {
    onText('Answer (v.25).');
    return { text: 'Answer (v.25).', model: ASK_AI_MODEL };
  });
  (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
  signedInUid = null;
  authListeners.clear();
});

describe('AskAIOverlay — hosted AI', () => {
  it('signed in: no form, the input is enabled', () => {
    signedInUid = 'uid-leader-1';
    renderOverlay();
    expect(screen.queryByTestId('quick-ai-setup')).toBeNull();
    expect(screen.getByLabelText(/Ask AI question/)).toBeEnabled();
  });

  it('signed out → sign-in completes: the form leaves and the pending question auto-sends', async () => {
    renderOverlay('Where does anxiety show up?');
    expect(streamStudyAIMock).not.toHaveBeenCalled();
    signIn('uid-leader-1');
    await waitFor(() => expect(streamStudyAIMock).toHaveBeenCalledTimes(1));
    expect(streamStudyAIMock.mock.calls[0][3]).toBe('Where does anxiety show up?');
    expect(screen.queryByTestId('quick-ai-setup')).toBeNull();
    // The answer's (lazy) markdown rendering is covered by AskAIOverlay.test.tsx; not awaited here (R6 flake budget).
    expect(screen.getByLabelText(/Ask AI question/)).toBeInTheDocument();
  });

  it.each([
    ['credit-used-up', AI_CREDIT_USED_UP, 402],
    ['service-paused', AI_SERVICE_PAUSED, 503],
  ] as const)('%s: the line alone — no own-key link, no Set up AI button', async (kind, line, status) => {
    signedInUid = 'uid-leader-1';
    streamStudyAIMock.mockRejectedValue(new AskAIError(kind, line, ASK_AI_MODEL, status));
    renderOverlay('auto question');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(line));
    expect(screen.getByRole('alert').querySelector('a')).toBeNull();
    expect(screen.getByRole('alert').textContent).not.toMatch(/OpenRouter|密钥|own key/);
    expect(screen.queryByRole('button', { name: SETUP_OPEN_BUTTON })).toBeNull();
  });

  it.each([
    ['quota', quotaLine(300)],
    ['daily-cap', AI_DAILY_CAP_REACHED],
  ] as const)('%s: the bilingual limit line, no link, no retry', async (kind, line) => {
    signedInUid = 'uid-leader-1';
    streamStudyAIMock.mockRejectedValue(new AskAIError(kind, line, ASK_AI_MODEL, 429));
    renderOverlay('auto question');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(line));
    expect(screen.getByRole('alert').querySelector('a')).toBeNull();
    expect(screen.queryByRole('button', { name: TV_RETRY })).toBeNull();
  });
});
