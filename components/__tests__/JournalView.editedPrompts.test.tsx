/**
 * JournalView.editedPrompts.test.tsx — prompts edited in Settings reach the AI · 设置中修改的提示词生效
 *
 * Profile → Settings lets the user edit each AI prompt and give the agent a
 * name. Reflect, Extend, Summarize and Chat used to build their requests from
 * their own string literals, so those edits were silently ignored. Here the
 * user edits the prompt in the Settings tab (the real textarea + blur) and
 * the request sent to services/studyAI (mocked) must carry the agent name
 * and the edited prompt — not the default.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/syncService', () => ({
  syncService: { canSync: () => false, syncJournal: vi.fn(), fetchJournalEntryBody: vi.fn(async () => undefined) },
}));
vi.mock('../signup/signupClient', () => ({ getSignupClient: () => null }));

const { streamStudyAI, chatStudyAI } = vi.hoisted(() => ({ streamStudyAI: vi.fn(), chatStudyAI: vi.fn() }));
vi.mock('../../services/studyAI', () => ({ streamStudyAI, chatStudyAI }));

import JournalView from '../JournalView';
import { journalStorage } from '../../services/journalStorage';
import { spiritualMemory } from '../../services/spiritualMemory';
import { DEFAULT_PROMPTS, type JournalPromptConfig } from '../../services/journalAIService';

const ENTRY_TEXT = 'Today I learned that grace is a gift I cannot earn, and I am grateful.';
const AGENT_NAME = 'Sophia';

/** Edit one prompt and the agent name the way the user does: Profile → Settings, type, leave the field. */
async function editInSettings(key: keyof JournalPromptConfig, edited: string) {
  fireEvent.click(screen.getByTitle('My Spiritual Profile'));
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  const name = screen.getByPlaceholderText('e.g. Grace, Sophia');
  fireEvent.change(name, { target: { value: AGENT_NAME } });
  fireEvent.blur(name);
  const prompt = screen.getByDisplayValue(DEFAULT_PROMPTS[key]);
  fireEvent.change(prompt, { target: { value: edited } });
  fireEvent.blur(prompt);
}

/** The request text of the one stream call, with the response-language directive stripped. */
function sentPrompt(): string {
  expect(streamStudyAI).toHaveBeenCalledTimes(1);
  const full = streamStudyAI.mock.calls[0][0] as string;
  return full.slice(full.indexOf('Your name is'));
}

interface ActionCase { key: keyof JournalPromptConfig; run: () => void; context: string }
const ACTIONS: ActionCase[] = [
  { key: 'reflection', run: () => fireEvent.click(screen.getByTitle('Reflect')), context: ENTRY_TEXT },
  { key: 'extend', run: () => fireEvent.click(screen.getByTitle('Extend thinking (select text or extends full entry)')), context: ENTRY_TEXT },
  { key: 'summarize', run: () => fireEvent.click(screen.getByTitle('Summarize')), context: ENTRY_TEXT },
  {
    key: 'chat',
    run: () => {
      fireEvent.click(screen.getByTitle('Chat about this entry'));
      fireEvent.change(screen.getByPlaceholderText('Ask about your entry...'), { target: { value: 'What is grace?' } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    },
    context: 'What is grace?',
  },
];

/** A working localStorage: the global test setup's is a bare vi.fn mock that stores nothing. */
function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', memoryStorage());
  await journalStorage.clearAll();
  await spiritualMemory.clearAll();
  await journalStorage.createEntry({ title: 'Grace note', plainText: ENTRY_TEXT, content: `<p>${ENTRY_TEXT}</p>` });
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo'];
  chatStudyAI.mockResolvedValue({ text: 'ok', model: 'served-model' });
  streamStudyAI.mockImplementation(async (_p: string, _h: unknown[], onChunk: (t: string) => void) => {
    onChunk('answer');
    return { text: 'answer', model: 'served-model' };
  });
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('JournalView — a prompt edited in Settings is the one sent to the AI', () => {
  for (const c of ACTIONS) {
    it(`${c.key}: the request starts with the agent name and the edited prompt, not the default`, async () => {
      render(<JournalView />);
      fireEvent.click(await screen.findByText('Grace note'));
      await screen.findByTitle('Summarize');
      const edited = `EDITED ${c.key} prompt: answer as a psalmist would.`;
      await editInSettings(c.key, edited);

      c.run();
      await waitFor(() => expect(streamStudyAI).toHaveBeenCalled());
      const sent = sentPrompt();
      expect(sent.startsWith(`Your name is ${AGENT_NAME}.\n\n${edited}\n\n`)).toBe(true);
      expect(sent).not.toContain(DEFAULT_PROMPTS[c.key]);
      expect(sent).toContain(c.context);
    });
  }
});
