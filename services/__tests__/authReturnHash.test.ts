/**
 * authReturnHash.test.ts — back to the same hash after sign-in · 登录返回测试
 *
 * Google and the emailed link/code (ADR-0020) both remember the page the
 * sign-in started on; the record lives in localStorage (an emailed link
 * opens a new tab), expires after an hour and is consumed on read.
 */
import { describe, it, expect } from 'vitest';
import {
  rememberAuthReturn, takeAuthReturn, authReturnTarget, AUTH_RETURN_HASH_KEY, AUTH_RETURN_TTL_MS, HashStore,
} from '../authReturnHash';

function memoryStore(): HashStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); },
  };
}

const T0 = Date.UTC(2026, 9, 23, 12, 0, 0);

describe('authReturnHash', () => {
  it('remembers a hash route and hands it back once', () => {
    const store = memoryStore();
    rememberAuthReturn('#/pack/local-2026-10-02-jhn3', store, T0);
    expect(JSON.parse(store.data.get(AUTH_RETURN_HASH_KEY)!)).toEqual({ hash: '#/pack/local-2026-10-02-jhn3', until: T0 + AUTH_RETURN_TTL_MS });
    expect(takeAuthReturn(store, T0 + 1000)).toBe('#/pack/local-2026-10-02-jhn3');
    expect(takeAuthReturn(store, T0 + 1000)).toBeNull();
  });

  it('expires after an hour (an abandoned sign-in never redirects a later visit), and is dropped either way', () => {
    expect(AUTH_RETURN_TTL_MS).toBe(60 * 60 * 1000);
    const store = memoryStore();
    rememberAuthReturn('#/new', store, T0);
    expect(takeAuthReturn(store, T0 + AUTH_RETURN_TTL_MS)).toBe('#/new');   // the last moment still counts
    rememberAuthReturn('#/new', store, T0);
    expect(takeAuthReturn(store, T0 + AUTH_RETURN_TTL_MS + 1)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('a record an older build left (a plain hash) or junk reads as none and is removed', () => {
    const store = memoryStore();
    store.data.set(AUTH_RETURN_HASH_KEY, '#/new');
    expect(takeAuthReturn(store, T0)).toBeNull();
    store.data.set(AUTH_RETURN_HASH_KEY, JSON.stringify({ hash: 7, until: 'soon' }));
    expect(takeAuthReturn(store, T0)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it('a bare root clears any earlier record; an undefined-returning store reads as none', () => {
    const store = memoryStore();
    rememberAuthReturn('#/signup/x', store, T0);
    rememberAuthReturn('#', store, T0);
    expect(takeAuthReturn(store, T0)).toBeNull();
    rememberAuthReturn('', store, T0);
    expect(store.data.size).toBe(0);
    expect(takeAuthReturn({ getItem: () => undefined, setItem: () => undefined, removeItem: () => undefined })).toBeNull();
  });

  it('the return target: an explicit returnTo wins, else the page the sign-in started on', () => {
    expect(authReturnTarget('', '#/leader')).toBe('#/leader');             // landing nav → leader home
    expect(authReturnTarget('#/leader', undefined)).toBe('#/leader');      // #/leader prompt stays
    expect(authReturnTarget('#app', undefined)).toBe('#app');              // personal app stays
    expect(authReturnTarget('#/signup/p1', undefined)).toBe('#/signup/p1'); // a sign-up page stays
    expect(authReturnTarget('#/setup', undefined)).toBe('#/setup');        // setup stays
    expect(authReturnTarget('#/new', undefined)).toBe('#/new');            // New study stays (email sign-in too)
    expect(authReturnTarget('', undefined)).toBe('');                      // bare landing: nothing to restore
  });
});
