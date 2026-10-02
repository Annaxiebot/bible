/**
 * tvReturn.test.ts — exit from TV mode goes back where it came from · 退出去向测试
 */
import { describe, it, expect } from 'vitest';
import { rememberTvReturn, takeTvReturn, TV_RETURN_KEY, TV_EXIT_DEFAULT_HASH, ReturnStore } from '../tvReturn';

function memoryStore(): ReturnStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: k => { data.delete(k); },
  };
}

describe('tvReturn', () => {
  it('returns the remembered editor hash for the same pack, once; the default afterwards', () => {
    const store = memoryStore();
    rememberTvReturn('local-a', '#/new/local-a', store);
    expect(takeTvReturn('local-a', store)).toBe('#/new/local-a');
    expect(store.data.has(TV_RETURN_KEY)).toBe(false);
    expect(takeTvReturn('local-a', store)).toBe(TV_EXIT_DEFAULT_HASH);
  });

  it('a record for another pack is ignored and kept (a pack opened directly exits to the app)', () => {
    const store = memoryStore();
    rememberTvReturn('local-a', '#/new/local-a', store);
    expect(takeTvReturn('2026-10-02-matt6', store)).toBe(TV_EXIT_DEFAULT_HASH);
    expect(store.data.has(TV_RETURN_KEY)).toBe(true);
  });

  it('no record, an empty store, or a corrupt record → the default exit', () => {
    const store = memoryStore();
    expect(takeTvReturn('x', store)).toBe('');
    store.setItem(TV_RETURN_KEY, '{not json');
    expect(takeTvReturn('x', store)).toBe('');
    store.setItem(TV_RETURN_KEY, JSON.stringify({ packId: 'x' }));
    expect(takeTvReturn('x', store)).toBe('');
    const undefinedStore = { getItem: () => undefined, setItem: () => undefined, removeItem: () => undefined };
    expect(takeTvReturn('x', undefinedStore)).toBe('');
  });
});
