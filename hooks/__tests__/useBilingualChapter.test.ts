/**
 * useBilingualChapter — each reader column loads, fails and retries on its own,
 * and late replies never mix chapters (2026-10 review: a failing Chinese edition
 * blanked both columns, and retry failed the same way).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const fetchChapter = vi.fn();
const getChapter = vi.fn();
const saveChapter = vi.fn();

vi.mock('../../services/bibleDataSource', () => ({
  fetchChapter: (...args: unknown[]) => fetchChapter(...args),
}));
vi.mock('../../services/bibleStorage', () => ({
  bibleStorage: {
    getChapter: (...args: unknown[]) => getChapter(...args),
    saveChapter: (...args: unknown[]) => saveChapter(...args),
  },
}));

import { useBilingualChapter, BilingualChapterArgs } from '../useBilingualChapter';

const verses = (book: string, chapter: number, t: string) => ({
  verses: [{ book_id: book, book_name: book, chapter, verse: 1, text: `${t} ${book} ${chapter}:1` }],
});

/** A deferred promise per (book, chapter, translation) so tests control reply order. */
function deferredSource() {
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  fetchChapter.mockImplementation((book: string, chapter: number, t: string) =>
    new Promise((resolve, reject) => { pending.set(`${book}:${chapter}:${t}`, { resolve, reject }); }));
  return pending;
}

const args = (over: Partial<BilingualChapterArgs> = {}): BilingualChapterArgs => ({
  bookId: 'MAT', chapter: 7, chineseVersion: 'cuv', englishVersion: 'kjv', ...over,
});

beforeEach(() => {
  fetchChapter.mockReset();
  getChapter.mockReset().mockResolvedValue(null);
  saveChapter.mockReset().mockResolvedValue(undefined);
});

describe('useBilingualChapter', () => {
  it('loads both columns', async () => {
    fetchChapter.mockImplementation(async (b: string, c: number, t: string) => verses(b, c, t));
    const { result } = renderHook(() => useBilingualChapter(args()));
    await waitFor(() => expect(result.current.bothSettled).toBe(true));
    expect(result.current.chinese.verses[0].text).toBe('cuv MAT 7:1');
    expect(result.current.english.verses[0].text).toBe('kjv MAT 7:1');
  });

  it('keeps the English text when the Chinese edition fails (and the reverse)', async () => {
    fetchChapter.mockImplementation(async (b: string, c: number, t: string) => {
      if (t === 'cuv') throw new Error('HTTP 404');
      return verses(b, c, t);
    });
    const { result } = renderHook(() => useBilingualChapter(args()));
    await waitFor(() => expect(result.current.bothSettled).toBe(true));
    expect(result.current.chinese.status).toBe('error');
    expect(result.current.chinese.verses).toEqual([]);
    expect(result.current.english.status).toBe('ready');
    expect(result.current.english.verses[0].text).toBe('kjv MAT 7:1');

    fetchChapter.mockImplementation(async (b: string, c: number, t: string) => {
      if (t === 'kjv') throw new Error('offline');
      return verses(b, c, t);
    });
    const other = renderHook(() => useBilingualChapter(args({ chapter: 8 })));
    await waitFor(() => expect(other.result.current.bothSettled).toBe(true));
    expect(other.result.current.english.status).toBe('error');
    expect(other.result.current.chinese.verses[0].text).toBe('cuv MAT 8:1');
  });

  it('retry reloads only the failed column and keeps the healthy one on screen', async () => {
    let cuvFails = true;
    fetchChapter.mockImplementation(async (b: string, c: number, t: string) => {
      if (t === 'cuv' && cuvFails) throw new Error('boom');
      return verses(b, c, t);
    });
    const { result } = renderHook(() => useBilingualChapter(args()));
    await waitFor(() => expect(result.current.chinese.status).toBe('error'));
    const englishBefore = result.current.english;
    const callsBefore = fetchChapter.mock.calls.length;

    cuvFails = false;
    act(() => result.current.retry('chinese'));
    expect(result.current.english).toBe(englishBefore); // untouched while Chinese reloads
    await waitFor(() => expect(result.current.chinese.status).toBe('ready'));
    expect(result.current.chinese.verses[0].text).toBe('cuv MAT 7:1');
    const newCalls = fetchChapter.mock.calls.slice(callsBefore);
    expect(newCalls.map(c => c[2])).toEqual(['cuv']);
  });

  it('falls back to the cached copy (offline) when the source fails', async () => {
    fetchChapter.mockRejectedValue(new Error('offline'));
    getChapter.mockImplementation(async (b: string, c: number, t: string) =>
      // First read misses, the post-failure read hits (cached meanwhile).
      getChapter.mock.calls.filter(call => call[2] === t).length > 1 ? verses(b, c, t) : null);
    const { result } = renderHook(() => useBilingualChapter(args()));
    await waitFor(() => expect(result.current.bothSettled).toBe(true));
    expect(result.current.chinese.offline).toBe(true);
    expect(result.current.isOffline).toBe(true);
    expect(result.current.english.verses[0].text).toBe('kjv MAT 7:1');
  });

  it('drops a late reply for the previous chapter instead of mixing it into the new one', async () => {
    const pending = deferredSource();
    const { result, rerender } = renderHook((a: BilingualChapterArgs) => useBilingualChapter(a), {
      initialProps: args({ chapter: 6 }),
    });
    await waitFor(() => expect(pending.size).toBe(2));
    rerender(args({ chapter: 7 }));
    await waitFor(() => expect(pending.size).toBe(4));

    // Chapter 7 English arrives, then the stale chapter 6 replies.
    await act(async () => { pending.get('MAT:7:kjv')!.resolve(verses('MAT', 7, 'kjv')); });
    await act(async () => {
      pending.get('MAT:6:cuv')!.resolve(verses('MAT', 6, 'cuv'));
      pending.get('MAT:6:kjv')!.resolve(verses('MAT', 6, 'kjv'));
    });
    expect(result.current.chinese.status).toBe('loading');
    expect(result.current.chinese.verses).toEqual([]);
    expect(result.current.english.verses[0].text).toBe('kjv MAT 7:1');

    await act(async () => { pending.get('MAT:7:cuv')!.resolve(verses('MAT', 7, 'cuv')); });
    expect(result.current.chinese.verses[0].text).toBe('cuv MAT 7:1');
  });

  it('never shows the previous chapter while the new one loads', async () => {
    fetchChapter.mockImplementation(async (b: string, c: number, t: string) => verses(b, c, t));
    const { result, rerender } = renderHook((a: BilingualChapterArgs) => useBilingualChapter(a), {
      initialProps: args({ chapter: 6 }),
    });
    await waitFor(() => expect(result.current.bothSettled).toBe(true));
    fetchChapter.mockImplementation(() => new Promise(() => {}));
    rerender(args({ chapter: 7 }));
    expect(result.current.chinese.status).toBe('loading');
    expect(result.current.chinese.verses).toEqual([]);
    expect(result.current.english.verses).toEqual([]);
  });

  it('an older retry that resolves after a newer one is ignored', async () => {
    const pending = deferredSource();
    const { result } = renderHook(() => useBilingualChapter(args()));
    await waitFor(() => expect(pending.size).toBe(2));
    await act(async () => { pending.get('MAT:7:cuv')!.reject(new Error('x')); });
    await waitFor(() => expect(result.current.chinese.status).toBe('error'));

    const first = new Promise(resolve => { fetchChapter.mockImplementationOnce(() => new Promise(r => setTimeout(() => r(verses('MAT', 7, 'stale')), 30)).then(resolve)); });
    act(() => result.current.retry('chinese'));
    fetchChapter.mockImplementationOnce(async () => verses('MAT', 7, 'fresh'));
    act(() => result.current.retry('chinese'));
    await waitFor(() => expect(result.current.chinese.verses[0]?.text).toBe('fresh MAT 7:1'));
    await first;
    await act(async () => { await new Promise(r => setTimeout(r, 5)); });
    expect(result.current.chinese.verses[0].text).toBe('fresh MAT 7:1');
  });

  it('switching the English edition reloads only the English column', async () => {
    fetchChapter.mockImplementation(async (b: string, c: number, t: string) => verses(b, c, t));
    const { result, rerender } = renderHook((a: BilingualChapterArgs) => useBilingualChapter(a), {
      initialProps: args({ englishVersion: 'bsb' }),
    });
    await waitFor(() => expect(result.current.bothSettled).toBe(true));
    const chineseBefore = result.current.chinese;
    const callsBefore = fetchChapter.mock.calls.length;
    rerender(args({ englishVersion: 'kjv' }));
    await waitFor(() => expect(result.current.english.verses[0]?.text).toBe('kjv MAT 7:1'));
    expect(result.current.chinese).toBe(chineseBefore);
    expect(fetchChapter.mock.calls.slice(callsBefore).map(c => c[2])).toEqual(['kjv']);
  });
});
