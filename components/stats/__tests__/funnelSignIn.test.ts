/**
 * funnelSignIn.test.ts — sign-in started / finished counts · 登录漏斗计数测试 (ADR-0025)
 *
 * A start counts at once and leaves a note (method + expiry) in this
 * browser; the session appearing (or an accepted code) turns the note into
 * one "finished" count for that method and removes it. No note, an expired
 * or unreadable note, a session still loading, or a second notification
 * count nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { noteSignInStart, takeSignInNote, finishSignIn, startFunnelSignInWatch } from '../funnelSignIn';
import { resetFunnelMemory } from '../funnel';
import { LOG_FUNNEL_FN } from '../funnelRules';
import { AUTH_RETURN_TTL_MS } from '../../../services/authReturnHash';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { installMemoryStorage } from '../../../tests/utils/memoryStorage';
import type { AuthState } from '../../../services/supabase';

type Seams = Window & { __SUPABASE_E2E__?: unknown };
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200 }) as Response);
const events = () => fetchMock.mock.calls
  .filter(([url]) => url.endsWith(`/rest/v1/rpc/${LOG_FUNNEL_FN}`))
  .map(([, init]) => (JSON.parse(String(init!.body)) as { p_event: string }).p_event);

let storage: Map<string, string>;
beforeEach(() => {
  storage = installMemoryStorage();
  resetFunnelMemory();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  (window as Seams).__SUPABASE_E2E__ = { url: 'http://localhost:3000/e2e-supabase', anonKey: 'e2e-anon' };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Seams).__SUPABASE_E2E__;
});

const state = (over: Partial<AuthState>): AuthState => ({ user: null, session: null, isAuthenticated: false, isLoading: false, ...over });

describe('sign-in started → finished', () => {
  it('a start counts and notes the method until the TTL; finishing counts once for that method', async () => {
    noteSignInStart('email', 1000);
    expect(JSON.parse(storage.get(STORAGE_KEYS.FUNNEL_SIGN_IN)!)).toEqual({ method: 'email', until: 1000 + AUTH_RETURN_TTL_MS });
    finishSignIn(2000);
    finishSignIn(3000);
    expect(storage.has(STORAGE_KEYS.FUNNEL_SIGN_IN)).toBe(false);
    await vi.waitFor(() => expect(events()).toEqual(['signin_started_email', 'signin_done_email']));
  });

  it('an expired, unreadable or unknown note finishes nothing (and is dropped)', () => {
    noteSignInStart('google', 0);
    expect(takeSignInNote(AUTH_RETURN_TTL_MS + 1)).toBeNull();
    storage.set(STORAGE_KEYS.FUNNEL_SIGN_IN, '{oops');
    expect(takeSignInNote(0)).toBeNull();
    storage.set(STORAGE_KEYS.FUNNEL_SIGN_IN, JSON.stringify({ method: 'github', until: 10 }));
    expect(takeSignInNote(0)).toBeNull();
    expect(storage.has(STORAGE_KEYS.FUNNEL_SIGN_IN)).toBe(false);
  });

  it('blocked storage: the start still counts, no finish is invented', async () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => undefined };
    noteSignInStart('google', 0, blocked);
    finishSignIn(1, blocked);
    await vi.waitFor(() => expect(events()).toEqual(['signin_started_google']));
  });
});

describe('startFunnelSignInWatch', () => {
  it('the session appearing finishes a noted sign-in once; loading or no note counts nothing', async () => {
    let listener: (s: AuthState) => void = () => undefined;
    const subscribe = vi.fn((l: (s: AuthState) => void) => { listener = l; return () => undefined; });
    startFunnelSignInWatch(subscribe);
    listener(state({ isLoading: true }));
    listener(state({ isAuthenticated: true }));   // a session restored on load, no note
    noteSignInStart('google');
    listener(state({ isAuthenticated: true, isLoading: true }));
    listener(state({}));
    listener(state({ isAuthenticated: true }));   // the redirect came back signed in
    listener(state({ isAuthenticated: true }));   // a token refresh re-notifies
    await vi.waitFor(() => expect(events()).toEqual(['signin_started_google', 'signin_done_google']));
  });
});
