/**
 * useChineseScript with a (fake) worker: re-renders from converter
 * notifications must not re-send still-uncached verses, and a total conversion
 * failure settles instead of staying pending forever (2026-10 review).
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useChineseScript } from '../useChineseScript';
import type { Verse } from '../../types';

const state = vi.hoisted(() => {
  const s = {
    mode: 'reply' as 'reply' | 'crash',
    posts: [] as Array<{ type: string; text?: string }>,
  };
  class FakeWorker {
    private listeners: Record<string, Array<(e: unknown) => void>> = { message: [], error: [] };
    addEventListener(type: string, fn: (e: unknown) => void) { this.listeners[type]?.push(fn); }
    postMessage(msg: { id: number; type: string; text?: string }) {
      s.posts.push(msg);
      const crash = s.mode === 'crash';
      // Staggered replies: each one notifies and re-renders the hook before the rest land.
      setTimeout(() => {
        if (crash) {
          for (const fn of this.listeners.error) fn(new Event('error'));
        } else {
          for (const fn of this.listeners.message) fn({ data: { id: msg.id, result: `~${msg.text}` } });
        }
      }, 5 * s.posts.length);
    }
  }
  (globalThis as { Worker?: unknown }).Worker = FakeWorker;
  return s;
});

// The main-thread fallback fails too (dictionary unavailable), in both directions.
vi.mock('opencc-js/t2cn', () => ({ Converter: () => { throw new Error('dictionary unavailable'); } }));
vi.mock('opencc-js/cn2t', () => ({ Converter: () => { throw new Error('dictionary unavailable'); } }));

afterAll(() => { delete (globalThis as { Worker?: unknown }).Worker; });

const verse = (n: number, text: string): Verse => ({ book_id: 'MAT', book_name: 'Matthew', chapter: 7, verse: n, text });

describe('useChineseScript — worker path', () => {
  it('each verse text is sent to the worker once despite notification re-renders', async () => {
    const verses = [verse(1, '甲'), verse(2, '乙'), verse(3, '丙')];
    const { result } = renderHook(() => useChineseScript(verses, true));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.verses.map(v => v.text)).toEqual(['~甲', '~乙', '~丙']);
    for (const text of ['甲', '乙', '丙']) {
      expect(state.posts.filter(p => p.type === 'toSimp' && p.text === text)).toHaveLength(1);
    }
  });

  it('settles on the original text when the worker and the fallback both fail', async () => {
    state.mode = 'crash';
    const verses = [verse(1, '丁'), verse(2, '戊')];
    const { result } = renderHook(() => useChineseScript(verses, true));
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.verses.map(v => v.text)).toEqual(['丁', '戊']);
  });

  it('a failure for an old chapter is not applied to the new one', async () => {
    state.mode = 'crash';
    const first = [verse(1, '己')];
    const second = [verse(2, '庚')];
    const { result, rerender } = renderHook(({ v }) => useChineseScript(v, true), { initialProps: { v: first } });
    state.mode = 'reply';
    rerender({ v: second });
    await waitFor(() => expect(result.current.pending).toBe(false));
    // The crash may take the new chapter's request down with it; either way only verse 2 shows.
    expect(result.current.verses.map(v => v.verse)).toEqual([2]);
    expect(['庚', '~庚']).toContain(result.current.verses[0].text);
  });
});
