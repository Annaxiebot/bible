/**
 * JournalView.aiErrors.test.tsx — the journal's AI actions show their failures · 日记AI错误提示
 *
 * The journal's AI goes through services/studyAI (mocked here to throw the
 * real typed AskAIErrors). Every user-triggered action — Reflect, Extend,
 * Summarize, Scripture, Chat, Weekly Digest, Profile — must show the shared
 * AI failure line next to its own control (sign-in line → 设置AI opens the AI
 * service dialog; quota line), end its busy state, and clear the line when
 * the action is clicked again and succeeds. Before this fix every one of
 * them caught the error and showed nothing.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('../../services/syncService', () => ({
  syncService: { canSync: () => false, syncJournal: vi.fn(), fetchJournalEntryBody: vi.fn(async () => undefined) },
}));
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

const { streamStudyAI, chatStudyAI } = vi.hoisted(() => ({ streamStudyAI: vi.fn(), chatStudyAI: vi.fn() }));
vi.mock('../../services/studyAI', () => ({ streamStudyAI, chatStudyAI }));

import JournalView from '../JournalView';
import { journalStorage } from '../../services/journalStorage';
import { spiritualMemory } from '../../services/spiritualMemory';
import { AskAIError, signInNeededError } from '../studypack/askAIErrors';
import { AI_SIGN_IN_NEEDED, quotaLine } from '../studypack/tvHints';
import { SETUP_TITLE, SETUP_OPEN_BUTTON, SETUP_SIGN_IN_TO_USE_AI } from '../setup/setupStrings';

const ENTRY_TEXT = 'Today I learned that grace is a gift I cannot earn, and I am grateful.';
const QUOTA_LIMIT = 30;
const quotaError = () => new AskAIError('quota', quotaLine(QUOTA_LIMIT), 'm', 429);

/** The stream answers `text` (the success path that must clear a shown failure). */
function answerWith(text: string) {
  streamStudyAI.mockImplementationOnce(async (_p: string, _h: unknown[], onChunk: (t: string) => void) => {
    onChunk(text);
    return { text, model: 'served-model' };
  });
}

async function openEntry() {
  render(<JournalView />);
  fireEvent.click(await screen.findByText('Grace note'));
  await screen.findByTitle('Summarize');
}

beforeEach(async () => {
  vi.clearAllMocks();
  await journalStorage.clearAll();
  await spiritualMemory.clearAll();
  await journalStorage.createEntry({ title: 'Grace note', plainText: ENTRY_TEXT, content: `<p>${ENTRY_TEXT}</p>` });
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo'];
});
afterEach(() => { vi.useRealTimers(); });

interface ToolbarCase { action: string; title: string; label: RegExp; success: string }
const TOOLBAR: ToolbarCase[] = [
  { action: 'reflect', title: 'Reflect', label: /Reflect$/, success: 'What gift are you holding today?' },
  { action: 'extend', title: 'Extend thinking (select text or extends full entry)', label: /Extend$/, success: 'Grace reaches further than effort.' },
  { action: 'summary', title: 'Summarize', label: /Summarize$/, success: '- Grace is a gift' },
  { action: 'scripture', title: 'Find Scripture', label: /Scripture$/, success: '[{"reference":"Ephesians 2:8","reason":"Saved by grace."}]' },
];

describe('JournalView — toolbar AI actions surface their failures', () => {
  for (const c of TOOLBAR) {
    it(`${c.action}: signed out → sign-in line under the toolbar; 设置AI opens the AI service dialog; busy state ends`, async () => {
      streamStudyAI.mockRejectedValueOnce(signInNeededError('m'));
      await openEntry();
      fireEvent.click(screen.getByTitle(c.title));
      const line = await screen.findByTestId(`journal-ai-error-${c.action}`);
      expect(within(line).getByRole('alert')).toHaveTextContent(AI_SIGN_IN_NEEDED);
      const button = screen.getByTitle(c.title);
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent(c.label);
      fireEvent.click(within(line).getByRole('button', { name: SETUP_OPEN_BUTTON }));
      expect(await screen.findByRole('dialog', { name: SETUP_TITLE })).toHaveTextContent(SETUP_SIGN_IN_TO_USE_AI);
    });

    it(`${c.action}: quota → the quota line; clicking again and succeeding clears it`, async () => {
      streamStudyAI.mockRejectedValueOnce(quotaError());
      await openEntry();
      fireEvent.click(screen.getByTitle(c.title));
      const line = await screen.findByTestId(`journal-ai-error-${c.action}`);
      expect(line).toHaveTextContent(quotaLine(QUOTA_LIMIT));
      answerWith(c.success);
      fireEvent.click(screen.getByTitle(c.title));
      await waitFor(() => expect(screen.queryByTestId(`journal-ai-error-${c.action}`)).toBeNull());
      expect(streamStudyAI).toHaveBeenCalledTimes(2);
    });
  }
});

describe('JournalView — chat, digest and profile surface their failures', () => {
  it('chat: signed out → the sign-in line inside the chat panel, no empty answer bubble; a later answer clears it', async () => {
    streamStudyAI.mockRejectedValueOnce(signInNeededError('m'));
    await openEntry();
    fireEvent.click(screen.getByTitle('Chat about this entry'));
    const input = screen.getByPlaceholderText('Ask about your entry...');
    fireEvent.change(input, { target: { value: 'What is grace?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const line = await screen.findByTestId('journal-ai-error-chat');
    expect(line).toHaveTextContent(AI_SIGN_IN_NEEDED);
    expect(screen.queryByText('Thinking...')).toBeNull();
    fireEvent.click(within(line).getByRole('button', { name: SETUP_OPEN_BUTTON }));
    expect(await screen.findByRole('dialog', { name: SETUP_TITLE })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog', { name: SETUP_TITLE }));    // the backdrop closes it

    answerWith('Grace is unearned favour.');
    fireEvent.change(input, { target: { value: 'Again?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Grace is unearned favour.')).toBeInTheDocument();
    expect(screen.queryByTestId('journal-ai-error-chat')).toBeNull();
  });

  it('weekly digest: quota → the quota line in the digest panel (not "No entries"); signed out → the sign-in line', async () => {
    chatStudyAI.mockRejectedValueOnce(quotaError());
    await openEntry();
    fireEvent.click(screen.getByTitle('Weekly Digest'));
    const line = await screen.findByTestId('journal-ai-error-digest');
    expect(line).toHaveTextContent(quotaLine(QUOTA_LIMIT));
    expect(screen.queryByText('No entries in the past 7 days.')).toBeNull();
    expect(screen.getByTitle('Weekly Digest')).toHaveTextContent('Weekly Digest');

    chatStudyAI.mockRejectedValueOnce(signInNeededError('m'));
    fireEvent.click(screen.getByTitle('Weekly Digest'));
    await waitFor(() => expect(screen.getByTestId('journal-ai-error-digest')).toHaveTextContent(AI_SIGN_IN_NEEDED));

    chatStudyAI.mockResolvedValueOnce({ text: '- Gratitude for grace', model: 'served-model' });
    fireEvent.click(screen.getByTitle('Weekly Digest'));
    await waitFor(() => expect(screen.queryByTestId('journal-ai-error-digest')).toBeNull());
  });

  it('profile: signed out → the sign-in line in the profile tab with 设置AI; a later success shows the profile', async () => {
    await spiritualMemory.addItem({ category: 'theme', content: 'Grace' });
    chatStudyAI.mockRejectedValueOnce(signInNeededError('m'));
    await openEntry();
    fireEvent.click(screen.getByTitle('My Spiritual Profile'));
    const line = await screen.findByTestId('journal-ai-error-profile');
    expect(line).toHaveTextContent(AI_SIGN_IN_NEEDED);
    expect(screen.queryByText('Generating your spiritual profile...')).toBeNull();
    fireEvent.click(within(line).getByRole('button', { name: SETUP_OPEN_BUTTON }));
    expect(await screen.findByRole('dialog', { name: SETUP_TITLE })).toBeInTheDocument();
  });

  it('profile: quota → the quota line; reopening after the quota resets shows the profile and no line', async () => {
    await spiritualMemory.addItem({ category: 'theme', content: 'Grace' });
    chatStudyAI.mockRejectedValueOnce(quotaError());
    await openEntry();
    fireEvent.click(screen.getByTitle('My Spiritual Profile'));
    expect(await screen.findByTestId('journal-ai-error-profile')).toHaveTextContent(quotaLine(QUOTA_LIMIT));
    chatStudyAI.mockResolvedValueOnce({ text: 'Key Themes: Grace', model: 'served-model' });
    fireEvent.click(screen.getByTitle('My Spiritual Profile'));
    expect(await screen.findByText(/Key Themes: Grace/)).toBeInTheDocument();
    expect(screen.queryByTestId('journal-ai-error-profile')).toBeNull();
  });
});
