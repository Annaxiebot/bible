/**
 * NotabilityEditor.aiErrors.test.tsx — the handwriting editor's AI menu shows failures · 手写笔记AI错误
 *
 * The journal's Notability editor streams AI through JournalView's onAIStream
 * (services/studyAI). A failed action used to log to the console and leave a
 * canned "(AI reflection failed…)" box; now the shared AI failure line sits
 * under the AI button (sign-in → 设置AI opens the AI service dialog; quota →
 * its line), the empty AI box is dropped, the button stops pulsing, and the
 * line clears when an action is chosen again and succeeds.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../services/supabase', async importOriginal => {
  const state = () => ({ user: null, session: null, isAuthenticated: false, isLoading: false });
  return {
    ...(await importOriginal<object>()),
    supabase: { auth: { getSession: async () => ({ data: { session: null }, error: null }) } },
    isSupabaseConfigured: () => true,
    authManager: {
      getState: state,
      getUserId: () => null,
      subscribe: (l: (s: unknown) => void) => { l(state()); return () => undefined; },
      signInWithGoogle: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
});
vi.mock('../signup/signupClient', () => ({ getSignupClient: () => null }));

import NotabilityEditor from '../NotabilityEditor';
import { AskAIError, signInNeededError } from '../studypack/askAIErrors';
import { AI_SIGN_IN_NEEDED, quotaLine } from '../studypack/tvHints';
import { SETUP_TITLE, SETUP_OPEN_BUTTON } from '../setup/setupStrings';

const QUOTA_LIMIT = 30;

function renderEditor(onAIStream: (prompt: string, onChunk: (t: string) => void) => Promise<void>) {
  render(<NotabilityEditor onSave={vi.fn()} onClose={vi.fn()} entryPlainText="Grace is a gift." onAIStream={onAIStream} />);
}

function chooseAIAction(label: RegExp) {
  fireEvent.click(screen.getByTitle('AI Actions'));
  fireEvent.click(screen.getByRole('button', { name: label }));
}

beforeEach(() => { vi.clearAllMocks(); });

describe('NotabilityEditor — AI menu failures', () => {
  it('signed out: the sign-in line under the AI button; 设置AI opens the AI service dialog; no canned failure box', async () => {
    const onAIStream = vi.fn().mockRejectedValueOnce(signInNeededError('m'));
    renderEditor(onAIStream);
    chooseAIAction(/Summarize/);
    const line = await screen.findByTestId('notability-ai-error');
    expect(line).toHaveTextContent(AI_SIGN_IN_NEEDED);
    expect(screen.queryByText(/AI reflection failed/)).toBeNull();
    expect(screen.getByTitle('AI Actions').className).not.toMatch(/animate-pulse/);
    fireEvent.click(within(line).getByRole('button', { name: SETUP_OPEN_BUTTON }));
    expect(await screen.findByRole('dialog', { name: SETUP_TITLE })).toBeInTheDocument();
  });

  it('quota: the quota line; choosing an action again that succeeds clears it', async () => {
    const onAIStream = vi.fn()
      .mockRejectedValueOnce(new AskAIError('quota', quotaLine(QUOTA_LIMIT), 'm', 429))
      .mockImplementationOnce(async (_p: string, onChunk: (t: string) => void) => { onChunk('Grace upon grace.'); });
    renderEditor(onAIStream);
    chooseAIAction(/Reflect/);
    expect(await screen.findByTestId('notability-ai-error')).toHaveTextContent(quotaLine(QUOTA_LIMIT));
    chooseAIAction(/Reflect/);
    await waitFor(() => expect(onAIStream).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByTestId('notability-ai-error')).toBeNull());
  });
});
