/**
 * ChatInterface.ai.test.tsx — the personal app's chat on the one AI path · 个人研经对话AI测试
 *
 * ADR-0007 "Personal app": the chat's AI settings button opens the study
 * pages' AI service dialog (never the old multi-provider panel); a message
 * goes through services/studyAI → aiTransport (only fetch and the session
 * are faked): signed in → ai-proxy with role 'study', the answer streams
 * into the chat; signed out → the TV overlay's sign-in line with its
 * "设置AI" button, which opens the same dialog. Provider-only features
 * (images, web search, read-aloud) show the one paused note.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let session: { access_token: string } | null = null;
vi.mock('../../services/supabase', () => {
  const state = () => ({ user: session ? { id: 'uid-1', email: 'me@example.org' } : null, session, isAuthenticated: !!session, isLoading: false });
  return {
    supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
    isSupabaseConfigured: () => true,
    authManager: {
      getState: state,
      getUserId: () => (session ? 'uid-1' : null),
      subscribe: (l: (s: unknown) => void) => { l(state()); return () => undefined; },
      signInWithGoogle: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  };
});
vi.mock('../signup/signupClient', () => ({ getSignupClient: () => null }));
vi.mock('../AIProviderSettings', () => ({
  default: () => { throw new Error('AIProviderSettings must not be rendered'); },
}));
vi.mock('../../services/chatHistoryStorage', () => ({
  loadThreadMessages: vi.fn(async () => []),
  saveThreadMessages: vi.fn(async () => undefined),
  findChapterThread: vi.fn(async () => null),
  getOrCreateChapterThread: vi.fn(async () => ({ id: 't1' })),
  createThread: vi.fn(async () => ({ id: 't1' })),
  deleteThread: vi.fn(async () => undefined),
}));
vi.mock('../../services/backgroundBibleDownload', () => ({ backgroundBibleDownload: { notifyApiActivity: vi.fn() } }));

import ChatInterface from '../ChatInterface';
import { SETUP_TITLE, SETUP_HOSTED_READY, SETUP_SIGN_IN_TO_USE_AI, SETUP_OPEN_BUTTON, PERSONAL_AI_UNAVAILABLE_NOTE } from '../setup/setupStrings';
import { AI_SIGN_IN_NEEDED } from '../studypack/tvHints';
import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from '../../services/systemPrompts';

const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const SERVED = 'google/gemini-2.5-flash';
const sse = (chunks: string[]) => chunks.map(c => `data: ${JSON.stringify({ model: SERVED, choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';

function stubFetch(chunks: string[]) {
  const fetchMock = vi.fn(async () => new Response(sse(chunks), { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function send(text: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
}

beforeEach(() => {
  // jsdom implements no element scrolling; the chat scrolls to the newest answer.
  Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo'];
  session = null;
  getItemMock.mockReset().mockReturnValue(null);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('ChatInterface — AI settings entry', () => {
  it('opens the AI service dialog (status page), not the provider panel; no provider/model pickers', async () => {
    session = { access_token: 'user-jwt' };
    render(<ChatInterface />);
    expect(screen.queryByRole('combobox')).toBeNull();               // the web-search provider select is gone
    expect(screen.queryByText(/深度思考/)).toBeNull();                 // so is the Sonnet/Haiku toggle
    expect(screen.getByText(PERSONAL_AI_UNAVAILABLE_NOTE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: SETUP_TITLE }));
    const dialog = await screen.findByRole('dialog', { name: SETUP_TITLE });
    expect(dialog).toHaveTextContent(SETUP_HOSTED_READY);
  });
});

describe('ChatInterface — one AI path', () => {
  it('signed in: the message goes to ai-proxy with role "study" and the answer streams into the chat', async () => {
    session = { access_token: 'user-jwt' };
    const fetchMock = stubFetch(['恩典 ', 'grace']);
    render(<ChatInterface />);
    send('What is grace?');
    await waitFor(() => expect(screen.getAllByText(/恩典 grace/).length).toBeGreaterThan(0));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://proj.supabase.co/functions/v1/ai-proxy');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ role: 'study', stream: true });
    expect(body.messages[0]).toEqual({ role: 'system', content: BIBLE_SCHOLAR_SYSTEM_PROMPT });
    expect(body.messages[body.messages.length - 1]).toEqual({ role: 'user', content: 'What is grace?' });
    expect(screen.getByTestId('chat-ai-model')).toHaveTextContent(SERVED);
  });

  it('signed out: the sign-in line with "设置AI", which opens the AI service dialog at its sign-in prompt', async () => {
    const fetchMock = stubFetch(['never']);
    render(<ChatInterface />);
    send('What is grace?');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(AI_SIGN_IN_NEEDED);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: SETUP_OPEN_BUTTON }));
    const dialog = await screen.findByRole('dialog', { name: SETUP_TITLE });
    expect(dialog).toHaveTextContent(SETUP_SIGN_IN_TO_USE_AI);
  });
});
