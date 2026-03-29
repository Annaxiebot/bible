import { describe, it, expect, vi, beforeEach } from 'vitest';
import { highlightMatches, unifiedSearch } from '../unifiedSearchService';

// Mock dependencies
vi.mock('../verseDataStorage', () => ({
  verseDataStorage: {
    searchResearch: vi.fn().mockResolvedValue([]),
    searchNotes: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../notesStorage', () => ({
  notesStorage: {
    getAllNotes: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../bibleBookData', () => ({
  BOOK_ID_TO_CHINESE_NAME: {
    GEN: '创世记',
    EXO: '出埃及记',
    PSA: '诗篇',
  },
}));

vi.mock('../../utils/textUtils', () => ({
  stripHTML: (text: string) => text.replace(/<[^>]+>/g, ''),
}));

function makeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

describe('unifiedSearchService', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
  });

  describe('highlightMatches', () => {
    it('wraps matching text in <mark> tags', () => {
      expect(highlightMatches('Hello World', 'World')).toBe('Hello <mark>World</mark>');
    });

    it('handles case-insensitive matching', () => {
      expect(highlightMatches('Hello WORLD', 'world')).toBe('Hello <mark>WORLD</mark>');
    });

    it('returns original text when query is empty', () => {
      expect(highlightMatches('Hello World', '')).toBe('Hello World');
    });

    it('escapes regex special characters in query', () => {
      expect(highlightMatches('price is $10.00', '$10.00')).toBe('price is <mark>$10.00</mark>');
    });

    it('highlights multiple occurrences', () => {
      expect(highlightMatches('the cat and the cat', 'the')).toBe('<mark>the</mark> cat and <mark>the</mark> cat');
    });
  });

  describe('unifiedSearch', () => {
    it('returns empty array for empty query', async () => {
      const results = await unifiedSearch('', 'all');
      expect(results).toEqual([]);
    });

    it('returns empty array for whitespace-only query', async () => {
      const results = await unifiedSearch('   ', 'all');
      expect(results).toEqual([]);
    });

    it('searches Bible text from localStorage cache', async () => {
      const cacheData = JSON.stringify({
        bookId: 'GEN',
        chapter: 1,
        verses: [
          { book_id: 'GEN', book_name: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning God created the heavens and the earth.' },
          { book_id: 'GEN', book_name: 'Genesis', chapter: 1, verse: 2, text: 'Now the earth was formless and empty.' },
        ],
      });
      vi.stubGlobal('localStorage', makeStorage({ bible_cache_GEN_1: cacheData }));

      const results = await unifiedSearch('beginning', 'bible');
      expect(results.length).toBe(1);
      expect(results[0].source).toBe('bible');
      expect(results[0].bookId).toBe('GEN');
      expect(results[0].verses).toEqual([1]);
    });

    it('searches AI research entries', async () => {
      const { verseDataStorage } = await import('../verseDataStorage');
      (verseDataStorage.searchResearch as any).mockResolvedValue([
        {
          id: 'GEN:1:1',
          bookId: 'GEN',
          chapter: 1,
          verses: [1],
          aiResearch: [
            { id: 'ai_1', query: 'creation theology', response: 'The creation narrative...', timestamp: 1000 },
          ],
        },
      ]);

      const results = await unifiedSearch('creation', 'research');
      expect(results.length).toBe(1);
      expect(results[0].source).toBe('research');
      expect(results[0].label).toContain('创世记');
    });

    it('searches personal notes from verseDataStorage', async () => {
      const { verseDataStorage } = await import('../verseDataStorage');
      (verseDataStorage.searchNotes as any).mockResolvedValue([
        {
          id: 'PSA:23:1',
          bookId: 'PSA',
          chapter: 23,
          verses: [1],
          aiResearch: [],
          personalNote: {
            text: 'The Lord is my shepherd - a beautiful psalm of trust',
            createdAt: 1000,
            updatedAt: 2000,
          },
        },
      ]);

      const results = await unifiedSearch('shepherd', 'notes');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].source).toBe('notes');
      expect(results[0].snippet).toContain('shepherd');
    });

    it('searches general notes from notesStorage', async () => {
      const { notesStorage } = await import('../notesStorage');
      (notesStorage.getAllNotes as any).mockResolvedValue({
        'GEN:1:1': 'My note about creation and God',
      });
      // Clear verseDataStorage mock to avoid duplicate results
      const { verseDataStorage } = await import('../verseDataStorage');
      (verseDataStorage.searchNotes as any).mockResolvedValue([]);

      const results = await unifiedSearch('creation', 'notes');
      expect(results.length).toBe(1);
      expect(results[0].source).toBe('notes');
    });

    it('merges results from all scopes when scope is "all"', async () => {
      // Set up Bible cache
      const cacheData = JSON.stringify({
        verses: [
          { book_id: 'GEN', book_name: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning God created.' },
        ],
      });
      vi.stubGlobal('localStorage', makeStorage({ bible_cache_GEN_1: cacheData }));

      // Set up AI research
      const { verseDataStorage } = await import('../verseDataStorage');
      (verseDataStorage.searchResearch as any).mockResolvedValue([
        {
          id: 'GEN:1:1',
          bookId: 'GEN',
          chapter: 1,
          verses: [1],
          aiResearch: [
            { id: 'ai_1', query: 'God in Genesis', response: 'God is the creator...', timestamp: 1000 },
          ],
        },
      ]);
      (verseDataStorage.searchNotes as any).mockResolvedValue([]);
      const { notesStorage } = await import('../notesStorage');
      (notesStorage.getAllNotes as any).mockResolvedValue({});

      const results = await unifiedSearch('God', 'all');
      // Should have both Bible text and research results
      const sources = new Set(results.map(r => r.source));
      expect(sources.has('bible')).toBe(true);
      expect(sources.has('research')).toBe(true);
    });

    it('limits results to maxResults', async () => {
      // Create many Bible cache results
      const verses = Array.from({ length: 100 }, (_, i) => ({
        book_id: 'GEN', book_name: 'Genesis', chapter: 1, verse: i + 1,
        text: `The word God appears in verse ${i + 1}.`,
      }));
      const cacheData = JSON.stringify({ verses });
      vi.stubGlobal('localStorage', makeStorage({ bible_cache_GEN_1: cacheData }));

      const results = await unifiedSearch('God', 'bible', 10);
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });
});
