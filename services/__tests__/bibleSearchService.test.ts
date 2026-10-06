// Regression: search still asked IndexedDB for the retired WEB text, so with
// BSB downloaded (the default since ADR-0003) English search found nothing.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getChapter = vi.fn();
vi.mock('../bibleStorage', async () => {
  const actual = await vi.importActual<typeof import('../bibleStorage')>('../bibleStorage');
  return { ...actual, bibleStorage: { getChapter: (...args: unknown[]) => getChapter(...args) } };
});
vi.mock('../chineseConverter', () => ({ toSimplifiedAsync: async (text: string) => text }));

import { bibleSearchService, scopeTranslations } from '../bibleSearchService';
import { STORAGE_KEYS } from '../../constants/storageKeys';

const JOHN_3_16 = { verse: 16, text: 'For God so loved the world' };

beforeEach(() => {
  getChapter.mockReset();
  getChapter.mockImplementation(async (bookId: string, chapter: number, translation: string) =>
    bookId === 'JHN' && chapter === 3 && translation === 'bsb' ? { verses: [JOHN_3_16] } : null);
});

describe('scopeTranslations', () => {
  it('English means the reader\'s chosen version, BSB by default; never WEB', () => {
    expect(scopeTranslations('english')).toEqual(['bsb']);
    expect(scopeTranslations('both')).toEqual(['cuv', 'bsb']);
    expect(scopeTranslations('cuv')).toEqual(['cuv']);
    vi.mocked(localStorage.getItem).mockImplementation(key => (key === STORAGE_KEYS.ENGLISH_VERSION ? 'kjv' : null));
    expect(scopeTranslations('english')).toEqual(['kjv']);
    vi.mocked(localStorage.getItem).mockReset();
  });
});

describe('bibleSearchService.search', () => {
  it('finds an English verse when only BSB is stored, and labels it bsb', async () => {
    const results = await bibleSearchService.search({ query: 'so loved', translation: 'english', testament: 'nt' });
    expect(results).toEqual([expect.objectContaining({ bookId: 'JHN', chapter: 3, verse: 16, translation: 'bsb' })]);
    expect(getChapter.mock.calls.some(call => call[2] === 'web')).toBe(false);
  });
});
