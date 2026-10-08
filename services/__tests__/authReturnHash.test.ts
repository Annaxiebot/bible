/**
 * authReturnHash.test.ts — back to the same hash after Google sign-in · 登录返回测试
 */
import { describe, it, expect } from 'vitest';
import { rememberAuthReturn, takeAuthReturn, authReturnTarget, AUTH_RETURN_HASH_KEY, HashStore } from '../authReturnHash';

function memoryStore(): HashStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); },
  };
}

describe('authReturnHash', () => {
  it('remembers a hash route and hands it back once', () => {
    const store = memoryStore();
    rememberAuthReturn('#/pack/local-2026-10-02-jhn3', store);
    expect(store.data.get(AUTH_RETURN_HASH_KEY)).toBe('#/pack/local-2026-10-02-jhn3');
    expect(takeAuthReturn(store)).toBe('#/pack/local-2026-10-02-jhn3');
    expect(takeAuthReturn(store)).toBeNull();
  });

  it('a bare root clears any earlier record; an undefined-returning store reads as none', () => {
    const store = memoryStore();
    rememberAuthReturn('#/signup/x', store);
    rememberAuthReturn('#', store);
    expect(takeAuthReturn(store)).toBeNull();
    rememberAuthReturn('', store);
    expect(store.data.size).toBe(0);
    expect(takeAuthReturn({ getItem: () => undefined, setItem: () => undefined, removeItem: () => undefined })).toBeNull();
  });

  it('the return target: an explicit returnTo wins, else the page the sign-in started on', () => {
    expect(authReturnTarget('', '#/leader')).toBe('#/leader');             // landing nav → leader home
    expect(authReturnTarget('#/leader', undefined)).toBe('#/leader');      // #/leader prompt stays
    expect(authReturnTarget('#app', undefined)).toBe('#app');              // personal app stays
    expect(authReturnTarget('#/signup/p1', undefined)).toBe('#/signup/p1'); // a sign-up page stays
    expect(authReturnTarget('#/setup', undefined)).toBe('#/setup');        // setup stays
    expect(authReturnTarget('', undefined)).toBe('');                      // bare landing: nothing to restore
  });
});
