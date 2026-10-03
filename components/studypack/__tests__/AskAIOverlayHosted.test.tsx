/**
 * AskAIOverlayHosted.test.tsx — the TV Ask-AI overlay under hosted AI · 本站AI问一问
 *
 * ADR-0007 gate with the session mocked (no key stored anywhere here):
 * signed in → no form, asking works; signing in while a question is pending
 * sends it; the hosted no-credit / paused lines are the only ones that link
 * to the AI service page's own-key option; the quota line offers neither
 * that link nor Retry. Split from AskAIOverlay.test.tsx (R4).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { TEST_PACK_PATH } from './fixtures';
import { parseStudyPack, buildSlides } from '../packTypes';
import { ASK_AI_MODEL } from '../../../services/aiDefaults';
import { SETUP_OPEN_BUTTON } from '../../setup/setupStrings';
import { SETUP_HASH } from '../../landing/landingRoute';
import { AI_CREDIT_USED_UP, AI_SERVICE_PAUSED, AI_OWN_KEY_ON_STATUS_PAGE, TV_RETRY, quotaLine } from '../tvHints';
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
    subscribe: (l: (s: unknown) => void) => { authListeners.add(l); l(authState()); return () => authListeners.delete(l); },
    signInWithGoogle: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  },
}));
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => null }));

import AskAIOverlay from '../AskAIOverlay';

function renderOverlay(initialQuestion: string | null = null) {
  const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
  render(<AskAIOverlay pack={pack} slide={buildSlides(pack)[0]} initialQuestion={initialQuestion} onClose={vi.fn()} />);
}

beforeEach(() => {
  streamStudyAIMock.mockReset().mockImplementation(async (_p, _s, _h, _q, onText: (t: string) => void) => {
    onText('Answer (v.25).');
    return { text: 'Answer (v.25).', model: ASK_AI_MODEL };
  });
  (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
  signedInUid = null;
  authListeners.clear();
});

describe('AskAIOverlay — hosted AI (no own key)', () => {
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
  ] as const)('%s: the line links to the AI service page\'s own-key option, no Set up AI button', async (kind, line, status) => {
    signedInUid = 'uid-leader-1';
    streamStudyAIMock.mockRejectedValue(new AskAIError(kind, line, ASK_AI_MODEL, status));
    renderOverlay('auto question');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(line));
    expect(screen.getByRole('link', { name: AI_OWN_KEY_ON_STATUS_PAGE })).toHaveAttribute('href', SETUP_HASH);
    expect(screen.queryByRole('button', { name: SETUP_OPEN_BUTTON })).toBeNull();
  });

  it('quota: the bilingual limit line, no own-key hint, no retry', async () => {
    signedInUid = 'uid-leader-1';
    streamStudyAIMock.mockRejectedValue(new AskAIError('quota', quotaLine(300), ASK_AI_MODEL, 429));
    renderOverlay('auto question');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(quotaLine(300)));
    expect(screen.queryByRole('link', { name: AI_OWN_KEY_ON_STATUS_PAGE })).toBeNull();
    expect(screen.queryByRole('button', { name: TV_RETRY })).toBeNull();
  });
});
