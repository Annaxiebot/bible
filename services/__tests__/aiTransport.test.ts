/**
 * aiTransport.test.ts — the one branch point for AI requests · AI请求路由测试 (ADR-0007)
 *
 * One rule since 2026-10-23: sign in to use AI. Signed in → the ai-proxy
 * function with the user's access token, the anon apikey header and `role`
 * added to the body; signed out → sign-in-needed without any fetch — even
 * with an old own OpenRouter key still in the browser (it is never read and
 * nothing goes to openrouter.ai). Also the dev-only e2e seam, the
 * availability gate and finalAIBody (the eval scripts' local copy of the
 * proxy's final messages).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OWN_OPENROUTER_KEY } from '../obsoleteStorageKeys';
import { signInSeam, signOutSeam, SEAM_BASE, SEAM_UID } from '../../tests/utils/hostedSeam';

let session: { access_token: string } | null = null;
let signedInUid: string | null = null;
vi.mock('../supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session }, error: null }) } },
  authManager: {
    getState: () => ({ user: signedInUid ? { id: signedInUid } : null, session, isAuthenticated: !!signedInUid, isLoading: false }),
  },
}));

import { SCOPE_GUARD, PACK_FROM_GUIDE_SYSTEM_PROMPT } from '../../supabase/functions/_shared/aiPrompts';
import * as transport from '../aiTransport';
import { sendAIRequest, isAIAvailable, hostedUid, aiProxyUrl, AI_PROXY_FUNCTION, E2E_ACCESS_TOKEN } from '../aiTransport';
import { finalAIBody } from '../aiFinalBody';

const BODY = JSON.stringify({ model: 'google/gemini-2.5-flash', stream: true, max_tokens: 300, messages: [{ role: 'user', content: 'q' }] });
const getItemMock = window.localStorage.getItem as ReturnType<typeof vi.fn>;

function stubFetch() {
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const call = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};
const oldOwnKey = () => getItemMock.mockImplementation((k: string) => (k === OWN_OPENROUTER_KEY ? 'sk-or-own' : null));

beforeEach(() => {
  session = null;
  signedInUid = null;
  getItemMock.mockReset().mockReturnValue(null);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
  signOutSeam();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); signOutSeam(); });

describe('sendAIRequest', () => {
  it('signed in → the ai-proxy function with the access token, anon apikey and the role', async () => {
    session = { access_token: 'user-jwt' };
    const fetchMock = stubFetch();
    const result = await sendAIRequest('pack', BODY, new AbortController().signal);
    expect(result.kind).toBe('hosted');
    const { url, headers, body } = call(fetchMock);
    expect(url).toBe(`https://proj.supabase.co/functions/v1/${AI_PROXY_FUNCTION}`);
    expect(AI_PROXY_FUNCTION).toBe('ai-proxy');
    expect(headers.Authorization).toBe('Bearer user-jwt');
    expect(headers.apikey).toBe('anon-key');
    expect(headers).not.toHaveProperty('X-Title');
    expect(body).toEqual({ ...JSON.parse(BODY), role: 'pack' });
  });

  it('an old own key in the browser changes nothing: signed in still goes to the proxy', async () => {
    oldOwnKey();
    session = { access_token: 'user-jwt' };
    const fetchMock = stubFetch();
    expect((await sendAIRequest('ask', BODY, new AbortController().signal)).kind).toBe('hosted');
    expect(call(fetchMock).url).not.toContain('openrouter.ai');
  });

  it('a body can never override the role', async () => {
    session = { access_token: 'user-jwt' };
    const fetchMock = stubFetch();
    await sendAIRequest('ask', JSON.stringify({ role: 'pack', messages: [] }), new AbortController().signal);
    expect(call(fetchMock).body.role).toBe('ask');
  });

  it('signed out → sign-in-needed, nothing fetched — with or without an old own key', async () => {
    const fetchMock = stubFetch();
    expect(await sendAIRequest('ask', BODY, new AbortController().signal)).toEqual({ kind: 'sign-in-needed' });
    oldOwnKey();
    expect(await sendAIRequest('ask', BODY, new AbortController().signal)).toEqual({ kind: 'sign-in-needed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dev e2e seam: __LEADER_E2E__ + __SUPABASE_E2E__ → the fake base with the e2e token', async () => {
    signInSeam();
    const fetchMock = stubFetch();
    await sendAIRequest('ask', BODY, new AbortController().signal);
    const { url, headers } = call(fetchMock);
    expect(url).toBe(aiProxyUrl(SEAM_BASE));
    expect(headers.Authorization).toBe(`Bearer ${E2E_ACCESS_TOKEN}`);
    expect(hostedUid()).toBe(SEAM_UID);
  });

  it('no direct path is exported any more', () => {
    expect(transport).not.toHaveProperty('ownKeyBody');
    expect(transport).not.toHaveProperty('hasOwnKey');
  });
});

describe('isAIAvailable', () => {
  it('signed in only; an old own key is not enough', () => {
    expect(isAIAvailable()).toBe(false);
    oldOwnKey();
    expect(isAIAvailable()).toBe(false);
    signedInUid = 'uid-1';
    expect(isAIAvailable()).toBe(true);
  });

  it('aiProxyUrl tolerates a trailing slash on the base', () => {
    expect(aiProxyUrl('https://p.supabase.co/')).toBe('https://p.supabase.co/functions/v1/ai-proxy');
  });
});

describe('finalAIBody (the eval scripts\' copy of the proxy\'s final messages)', () => {
  const withExtra = (extra: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(BODY), ...extra });

  it('the server system message goes first; the caller\'s model and cap are kept', () => {
    const body = JSON.parse(finalAIBody('ask', BODY));
    expect(body.messages[0].content).toContain(SCOPE_GUARD);
    expect(body.model).toBe('google/gemini-2.5-flash');
    expect(body.max_tokens).toBe(300);
  });

  it('"guide" on pack is consumed: the guide system text goes first, the field is not forwarded', () => {
    const body = JSON.parse(finalAIBody('pack', withExtra({ pack_source: 'guide' })));
    expect(body).not.toHaveProperty('pack_source');
    expect(body.messages[0].content).toBe(`${SCOPE_GUARD}\n\n${PACK_FROM_GUIDE_SYSTEM_PROMPT}`);
  });

  it('refused like the proxy refuses it: another role, or another value, throws', () => {
    expect(() => finalAIBody('ask', withExtra({ pack_source: 'guide' }))).toThrow('pack_source is only for role pack');
    expect(() => finalAIBody('pack', withExtra({ pack_source: 'pdf' }))).toThrow('pack_source must be guide');
  });
});
