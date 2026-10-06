/**
 * studyAI.test.ts — the personal app's one AI path · 个人研经AI路由测试 (ADR-0007 "Personal app")
 *
 * Only fetch and the session are faked; services/studyAI, askAIStream and
 * aiTransport run for real, so these pin the whole route:
 *   own key → OpenRouter directly (no role, the key owner's Ask-AI model);
 *   signed in → the ai-proxy function with role 'study';
 *   neither → an AskAIError 'sign-in-needed' and no request at all.
 * Plus every personal-app caller (journal stream + chat, vibe) reaching
 * the proxy with role 'study', the history fit to the proxy's limits, and
 * the typed failures the chat shows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { OPENROUTER_API_URL } from '../openrouter';
import { ASK_AI_MODEL } from '../aiDefaults';
import { ROLE_MAX_TOKENS, MAX_MESSAGES, MAX_TOTAL_CHARS } from '../../supabase/functions/ai-proxy/policy';
import { AI_SIGN_IN_NEEDED } from '../../components/studypack/tvHints';

let session: { access_token: string } | null = null;
vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
  authManager: {
    getState: () => ({ user: session ? { id: 'uid-1' } : null, session, isAuthenticated: !!session, isLoading: false }),
    subscribe: () => () => undefined,
  },
  isSupabaseConfigured: () => true,
}));

import { streamStudyAI, chatStudyAI, fitHistory, buildStudyBody, STUDY_AI_TITLE } from '../studyAI';
import { AskAIError } from '../../components/studypack/askAIErrors';
import { generateVibeCSS } from '../vibe';
import { streamAI, extendThinking } from '../journalAIService';

const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;
const SERVED = 'google/gemini-2.5-flash';

function sse(chunks: string[]): string {
  return chunks.map(c => `data: ${JSON.stringify({ model: SERVED, choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
}

function stubFetch(reply: () => Response) {
  const fetchMock = vi.fn(async () => reply());
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const streamReply = (chunks: string[]) => () => new Response(sse(chunks), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
const call = (fetchMock: ReturnType<typeof stubFetch>, i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as unknown as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};
const ownKey = () => getItemMock.mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'sk-or-own' : null));

beforeEach(() => {
  session = null;
  getItemMock.mockReset().mockReturnValue(null);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('streamStudyAI routing', () => {
  it('own key → OpenRouter directly: no role, the Ask-AI model, the study cap, the system prompt first', async () => {
    ownKey();
    const fetchMock = stubFetch(streamReply(['你好 ', 'world']));
    const chunks: string[] = [];
    const result = await streamStudyAI('q', [{ role: 'user', content: 'earlier' }], c => chunks.push(c), { system: 'SYS' });
    const { url, headers, body } = call(fetchMock);
    expect(url).toBe(OPENROUTER_API_URL);
    expect(headers.Authorization).toBe('Bearer sk-or-own');
    expect(headers['X-Title']).toBe(STUDY_AI_TITLE);
    expect(body).not.toHaveProperty('role');
    expect(body).toMatchObject({ model: ASK_AI_MODEL, stream: true, max_tokens: ROLE_MAX_TOKENS.study });
    expect(body.messages).toEqual([
      { role: 'system', content: 'SYS' }, { role: 'user', content: 'earlier' }, { role: 'user', content: 'q' },
    ]);
    expect(chunks).toEqual(['你好 ', 'world']);
    expect(result).toEqual({ text: '你好 world', model: SERVED });
  });

  it('no key, signed in → the ai-proxy function with role "study" and the access token', async () => {
    session = { access_token: 'user-jwt' };
    const fetchMock = stubFetch(streamReply(['answer']));
    const result = await chatStudyAI('q');
    const { url, headers, body } = call(fetchMock);
    expect(url).toBe('https://proj.supabase.co/functions/v1/ai-proxy');
    expect(headers.Authorization).toBe('Bearer user-jwt');
    expect(headers.apikey).toBe('anon-key');
    expect(body).toMatchObject({ role: 'study', stream: true, max_tokens: 4000 });
    expect(result.text).toBe('answer');
  });

  it('neither → AskAIError sign-in-needed (the TV overlay\'s line), no request sent', async () => {
    const fetchMock = stubFetch(streamReply(['never']));
    const err = await chatStudyAI('q').catch(e => e);
    expect(err).toBeInstanceOf(AskAIError);
    expect(err.kind).toBe('sign-in-needed');
    expect(err.message).toBe(AI_SIGN_IN_NEEDED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a hosted 429 quota reply → the quota line (never swallowed)', async () => {
    session = { access_token: 'user-jwt' };
    stubFetch(() => new Response(JSON.stringify({ error: 'quota', limit: 100 }), { status: 429 }));
    const err = await chatStudyAI('q').catch(e => e);
    expect(err.kind).toBe('quota');
    expect(err.message).toContain('100');
  });

  it('an empty stream is an "empty" failure, not a blank answer (no vacuous success)', async () => {
    session = { access_token: 'user-jwt' };
    stubFetch(streamReply([]));
    const err = await chatStudyAI('q').catch(e => e);
    expect(err.kind).toBe('empty');
  });

  it('a user abort resolves with what arrived (empty) instead of failing', async () => {
    session = { access_token: 'user-jwt' };
    const controller = new AbortController();
    stubFetch(() => { controller.abort(); return new Response('', { status: 200 }); });
    await expect(streamStudyAI('q', [], () => undefined, { signal: controller.signal })).resolves.toEqual({ text: '', model: ASK_AI_MODEL });
  });
});

describe('every personal-app caller goes through role "study"', () => {
  beforeEach(() => { session = { access_token: 'user-jwt' }; });

  it('journal streamAI (reflection / extend / scripture finder)', async () => {
    const fetchMock = stubFetch(streamReply(['反思']));
    const chunks: string[] = [];
    const meta = await streamAI('reflect', c => chunks.push(c));
    expect(call(fetchMock).body.role).toBe('study');
    expect(chunks.join('')).toBe('反思');
    expect(meta.model).toBe(SERVED);
  });

  it('journal one-shot calls (extendThinking)', async () => {
    const fetchMock = stubFetch(streamReply(['more']));
    expect(await extendThinking('my note')).toBe('more');
    expect(call(fetchMock).body.role).toBe('study');
  });

  it('vibe CSS', async () => {
    const fetchMock = stubFetch(streamReply(['EXPLANATION: Dark\nCSS:\n.vibe-app-root { color: #000; }']));
    const r = await generateVibeCSS('dark');
    expect(r.css).toContain('.vibe-app-root');
    expect(call(fetchMock).body.role).toBe('study');
  });
});

describe('fitHistory / buildStudyBody — never a 400 for a long thread', () => {
  it('keeps the newest turns within MAX_MESSAGES (system + prompt included) and drops system rows', () => {
    const history = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` }));
    const kept = fitHistory([{ role: 'system', content: 'x' }, ...history], 0, 2);
    expect(kept).toHaveLength(MAX_MESSAGES - 2);
    expect(kept[kept.length - 1].content).toBe('m59');
    expect(kept.some(m => m.role === 'system')).toBe(false);
  });

  it('keeps the total characters within MAX_TOTAL_CHARS, newest first', () => {
    const big = 'x'.repeat(MAX_TOTAL_CHARS / 2);
    const kept = fitHistory([{ role: 'user', content: big }, { role: 'assistant', content: big }, { role: 'user', content: 'last' }], 10, 2);
    expect(kept.map(m => m.content.length)).toEqual([big.length, 4]);
  });

  it('the body carries no system message when none is given', () => {
    const body = JSON.parse(buildStudyBody('q', []));
    expect(body.messages).toEqual([{ role: 'user', content: 'q' }]);
  });
});
