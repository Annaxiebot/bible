/**
 * aiTransport.test.ts — the one branch point for AI requests · AI请求路由测试 (ADR-0007)
 *
 * Own key → OpenRouter directly, exactly as before (key bearer, no role);
 * no key + signed in → the ai-proxy function with the user's access token,
 * the anon apikey header and `role` added to the body; neither →
 * sign-in-needed without any fetch. Also the dev-only e2e seam and the
 * availability gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { OPENROUTER_API_URL } from '../openrouter';

let session: { access_token: string } | null = null;
let signedInUid: string | null = null;
vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
  authManager: {
    getState: () => ({ user: signedInUid ? { id: signedInUid } : null, session, isAuthenticated: !!signedInUid, isLoading: false }),
  },
}));

import { sendAIRequest, isAIAvailable, hostedUid, aiProxyUrl, AI_PROXY_FUNCTION, E2E_ACCESS_TOKEN } from '../aiTransport';

const BODY = JSON.stringify({ model: 'google/gemini-2.5-flash', stream: true, max_tokens: 300, messages: [{ role: 'user', content: 'q' }] });
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;
type Seams = Window & { __LEADER_E2E__?: unknown; __SUPABASE_E2E__?: unknown };

function stubFetch() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const call = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};

beforeEach(() => {
  session = null;
  signedInUid = null;
  getItemMock.mockReset().mockReturnValue(null);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  delete (window as Seams).__LEADER_E2E__;
  delete (window as Seams).__SUPABASE_E2E__;
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('sendAIRequest', () => {
  it('own key stored → OpenRouter directly with that key; the body is untouched (no role), even when signed in', async () => {
    getItemMock.mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'sk-or-own' : null));
    session = { access_token: 'user-jwt' };
    signedInUid = 'uid-1';
    const fetchMock = stubFetch();
    const result = await sendAIRequest('ask', BODY, new AbortController().signal, 'Title');
    expect(result.kind).toBe('own-key');
    const { url, headers, body } = call(fetchMock);
    expect(url).toBe(OPENROUTER_API_URL);
    expect(headers.Authorization).toBe('Bearer sk-or-own');
    expect(headers['X-Title']).toBe('Title');
    expect(body).toEqual(JSON.parse(BODY));
  });

  it('no key, signed in → the ai-proxy function with the access token, anon apikey and the role', async () => {
    session = { access_token: 'user-jwt' };
    const fetchMock = stubFetch();
    const result = await sendAIRequest('pack', BODY, new AbortController().signal, 'Title');
    expect(result.kind).toBe('hosted');
    const { url, headers, body } = call(fetchMock);
    expect(url).toBe(`https://proj.supabase.co/functions/v1/${AI_PROXY_FUNCTION}`);
    expect(AI_PROXY_FUNCTION).toBe('ai-proxy');
    expect(headers.Authorization).toBe('Bearer user-jwt');
    expect(headers.apikey).toBe('anon-key');
    expect(headers).not.toHaveProperty('X-Title');
    expect(body).toEqual({ ...JSON.parse(BODY), role: 'pack' });
  });

  it('a body can never override the role', async () => {
    session = { access_token: 'user-jwt' };
    const fetchMock = stubFetch();
    await sendAIRequest('ask', JSON.stringify({ role: 'pack', messages: [] }), new AbortController().signal, 'T');
    expect(call(fetchMock).body.role).toBe('ask');
  });

  it('no key, signed out → sign-in-needed, nothing fetched', async () => {
    const fetchMock = stubFetch();
    expect(await sendAIRequest('ask', BODY, new AbortController().signal, 'T')).toEqual({ kind: 'sign-in-needed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dev e2e seam: __LEADER_E2E__ + __SUPABASE_E2E__ → the fake base with the e2e token', async () => {
    (window as Seams).__LEADER_E2E__ = { uid: 'e2e-uid', email: null, name: null };
    (window as Seams).__SUPABASE_E2E__ = { url: 'http://localhost:3000/e2e-supabase', anonKey: 'e2e-anon' };
    const fetchMock = stubFetch();
    await sendAIRequest('ask', BODY, new AbortController().signal, 'T');
    const { url, headers } = call(fetchMock);
    expect(url).toBe(aiProxyUrl('http://localhost:3000/e2e-supabase'));
    expect(headers.Authorization).toBe(`Bearer ${E2E_ACCESS_TOKEN}`);
    expect(hostedUid()).toBe('e2e-uid');
  });
});

describe('isAIAvailable', () => {
  it('own key OR signed in; neither → false', () => {
    expect(isAIAvailable()).toBe(false);
    signedInUid = 'uid-1';
    expect(isAIAvailable()).toBe(true);
    signedInUid = null;
    getItemMock.mockImplementation((k: string) => (k === STORAGE_KEYS.OPENROUTER_API_KEY ? 'k' : null));
    expect(isAIAvailable()).toBe(true);
  });

  it('aiProxyUrl tolerates a trailing slash on the base', () => {
    expect(aiProxyUrl('https://p.supabase.co/')).toBe('https://p.supabase.co/functions/v1/ai-proxy');
  });
});
