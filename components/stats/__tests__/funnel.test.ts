/**
 * funnel.test.ts — the anonymous counter's rules in the browser · 匿名漏斗计数测试 (ADR-0025)
 *
 * Where counts go (production: the build's project; dev/tests: only the e2e
 * base), what one POST carries (the anon key and nothing else — no session
 * token, no id; keepalive), the repeat window (storage, memory when storage
 * is blocked, a clock set back), and one generation = Generate pressed + the
 * first outcome only (pagehide = abandoned). A failed POST never throws.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  funnelBase, claimRepeatWindow, postFunnelEvent, trackFunnel, startGenerationFunnel, resetFunnelMemory, FUNNEL_REPEAT_MS,
} from '../funnel';
import {
  LOG_FUNNEL_FN, FUNNEL_EVENTS, FUNNEL_WAIT_EVENTS, FUNNEL_ONCE_PER_WINDOW, FUNNEL_MAX_WAIT_SECONDS, isFunnelEvent, waitSeconds,
} from '../funnelRules';
import { installMemoryStorage } from '../../../tests/utils/memoryStorage';
import { STORAGE_KEYS } from '../../../constants/storageKeys';

const BASE = { url: 'http://localhost:3000/e2e-supabase', anonKey: 'e2e-anon' };
type Seams = Window & { __SUPABASE_E2E__?: unknown };
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ({ ok: true, status: 200 }) as Response);

/** The funnel POSTs seen: event and wait, in order. */
const sent = () => fetchMock.mock.calls
  .filter(([url]) => url.endsWith(`/rest/v1/rpc/${LOG_FUNNEL_FN}`))
  .map(([, init]) => JSON.parse(String(init!.body)) as { p_event: string; p_wait_seconds: number | null });

let storage: Map<string, string>;
beforeEach(() => {
  storage = installMemoryStorage();
  resetFunnelMemory();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  (window as Seams).__SUPABASE_E2E__ = BASE;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Seams).__SUPABASE_E2E__;
});

describe('funnelRules', () => {
  it('the outcomes are the only events with a wait; repeat-window events are the page and sign-in ones', () => {
    expect(FUNNEL_WAIT_EVENTS).toEqual(['pack_ok', 'pack_failed', 'pack_abandoned']);
    expect(FUNNEL_ONCE_PER_WINDOW).toEqual([
      'new_study_opened', 'signin_started_google', 'signin_started_email', 'signin_done_google', 'signin_done_email',
    ]);
    for (const e of FUNNEL_EVENTS) expect(isFunnelEvent(e)).toBe(true);
    expect(isFunnelEvent('pack_maybe')).toBe(false);
    expect(isFunnelEvent(7)).toBe(false);
  });

  it('waitSeconds: whole seconds, never negative, never above the server limit', () => {
    expect(waitSeconds(1000, 75_400)).toBe(74);
    expect(waitSeconds(5000, 1000)).toBe(0);
    expect(waitSeconds(0, 10 * FUNNEL_MAX_WAIT_SECONDS * 1000)).toBe(FUNNEL_MAX_WAIT_SECONDS);
  });
});

describe('funnelBase', () => {
  it('dev builds and tests: only the dev-only e2e base (never the env project)', () => {
    expect(funnelBase(true, { VITE_SUPABASE_URL: 'https://live.supabase.co', VITE_SUPABASE_ANON_KEY: 'live' })).toEqual(BASE);
    delete (window as Seams).__SUPABASE_E2E__;
    expect(funnelBase(true, { VITE_SUPABASE_URL: 'https://live.supabase.co', VITE_SUPABASE_ANON_KEY: 'live' })).toBeNull();
  });

  it('production: the build\'s project, or nothing when it has none', () => {
    expect(funnelBase(false, { VITE_SUPABASE_URL: 'https://live.supabase.co', VITE_SUPABASE_ANON_KEY: 'live' }))
      .toEqual({ url: 'https://live.supabase.co', anonKey: 'live' });
    expect(funnelBase(false, {})).toBeNull();
  });
});

describe('postFunnelEvent', () => {
  it('one keepalive POST to the RPC with the anon key only — no session token, no id in the body', async () => {
    await postFunnelEvent({ ...BASE, url: `${BASE.url}/` }, 'pack_ok', 74, fetchMock as unknown as typeof fetch);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE.url}/rest/v1/rpc/${LOG_FUNNEL_FN}`);
    expect(init).toMatchObject({ method: 'POST', keepalive: true });
    expect(init!.headers).toEqual({ 'Content-Type': 'application/json', apikey: BASE.anonKey, Authorization: `Bearer ${BASE.anonKey}` });
    expect(JSON.parse(String(init!.body))).toEqual({ p_event: 'pack_ok', p_wait_seconds: 74 });
  });

  it('a network failure never throws', async () => {
    const failing = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(postFunnelEvent(BASE, 'generate_pressed', null, failing as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});

describe('the repeat window', () => {
  it('a page-open is sent once per window; after the window, again; the time is kept in this browser only', () => {
    expect(claimRepeatWindow('new_study_opened', 1_000_000)).toBe(true);
    expect(claimRepeatWindow('new_study_opened', 1_000_000 + FUNNEL_REPEAT_MS - 1)).toBe(false);
    expect(JSON.parse(storage.get(STORAGE_KEYS.FUNNEL_LAST_SENT)!)).toEqual({ new_study_opened: 1_000_000 });
    resetFunnelMemory();   // a reload: the stored time still holds
    expect(claimRepeatWindow('new_study_opened', 1_000_000 + 60_000)).toBe(false);
    expect(claimRepeatWindow('new_study_opened', 1_000_000 + FUNNEL_REPEAT_MS)).toBe(true);
    expect(claimRepeatWindow('signin_started_email', 1_000_000 + FUNNEL_REPEAT_MS)).toBe(true);   // per event
  });

  it('a clock set back beyond the window does not block the browser for good', () => {
    expect(claimRepeatWindow('new_study_opened', 5 * FUNNEL_REPEAT_MS)).toBe(true);
    expect(claimRepeatWindow('new_study_opened', FUNNEL_REPEAT_MS)).toBe(true);
  });

  it('blocked or unreadable storage: this page\'s memory still drops quick repeats', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(claimRepeatWindow('new_study_opened', 1_000_000, throwing)).toBe(true);
    expect(claimRepeatWindow('new_study_opened', 1_000_100, throwing)).toBe(false);
    expect(claimRepeatWindow('signin_done_google', 1_000_000, null)).toBe(true);
    expect(claimRepeatWindow('signin_done_google', 1_000_100, null)).toBe(false);
    storage.set(STORAGE_KEYS.FUNNEL_LAST_SENT, '{oops');
    expect(claimRepeatWindow('signin_started_google', 1_000_000)).toBe(true);
  });
});

describe('trackFunnel', () => {
  it('repeatable events go through the window; generation events are never dropped', async () => {
    trackFunnel('new_study_opened');
    trackFunnel('new_study_opened');
    trackFunnel('generate_pressed');
    trackFunnel('generate_pressed');
    trackFunnel('pack_failed', 3);
    await vi.waitFor(() => expect(sent()).toHaveLength(4));
    expect(sent().map(s => s.p_event)).toEqual(['new_study_opened', 'generate_pressed', 'generate_pressed', 'pack_failed']);
    expect(sent()[3].p_wait_seconds).toBe(3);
  });

  it('no base (signed-out dev page, no e2e override): nothing is sent and no window is used up', () => {
    delete (window as Seams).__SUPABASE_E2E__;
    trackFunnel('new_study_opened');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.has(STORAGE_KEYS.FUNNEL_LAST_SENT)).toBe(false);
  });
});

describe('startGenerationFunnel', () => {
  function fakeTarget() {
    const listeners = new Set<() => void>();
    return {
      addEventListener: vi.fn((_t: string, l: () => void) => { listeners.add(l); }),
      removeEventListener: vi.fn((_t: string, l: () => void) => { listeners.delete(l); }),
      hide: () => [...listeners].forEach(l => l()),
      size: () => listeners.size,
    };
  }

  it('Generate pressed, then the first outcome with the wait; later outcomes and pagehide are ignored', async () => {
    let now = 10_000;
    const target = fakeTarget();
    const funnel = startGenerationFunnel(() => now, target as unknown as Window);
    expect(target.addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
    now += 74_400;
    funnel.settle('ok');
    funnel.settle('failed');
    target.hide();
    expect(target.size()).toBe(0);
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()).toEqual([{ p_event: 'generate_pressed', p_wait_seconds: null }, { p_event: 'pack_ok', p_wait_seconds: 74 }]);
  });

  it('the page closing (pagehide) before an outcome counts as abandoned, once', async () => {
    let now = 0;
    const target = fakeTarget();
    const funnel = startGenerationFunnel(() => now, target as unknown as Window);
    now = 30_000;
    target.hide();
    funnel.settle('ok');   // a late result after the page hid
    await vi.waitFor(() => expect(sent()).toHaveLength(2));
    expect(sent()[1]).toEqual({ p_event: 'pack_abandoned', p_wait_seconds: 30 });
  });
});
