import { describe, it, expect } from 'vitest';
import { calculateMetadata, groupByBook } from '../notesExporter';
import { VerseData } from '../../../types/verseData';

function makeVerseData(overrides: Partial<VerseData> = {}): VerseData {
  return {
    id: 'gen_1_1',
    bookId: 'gen',
    chapter: 1,
    verses: [1],
    aiResearch: [],
    ...overrides,
  };
}

describe('calculateMetadata', () => {
  it('counts notes and research entries', () => {
    const data: VerseData[] = [
      makeVerseData({
        personalNote: { text: 'test', createdAt: 1, updatedAt: 1 },
        aiResearch: [
          { id: 'r1', query: 'q', response: 'r', timestamp: 1 },
          { id: 'r2', query: 'q', response: 'r', timestamp: 1 },
        ],
      }),
      makeVerseData({ id: 'exo_1_1', bookId: 'exo', aiResearch: [] }),
    ];

    const meta = calculateMetadata(data);
    expect(meta.totalNotes).toBe(1);
    expect(meta.totalResearch).toBe(2);
    expect(meta.booksIncluded).toContain('gen');
    expect(meta.booksIncluded).toContain('exo');
  });

  it('returns zero counts for empty data', () => {
    const meta = calculateMetadata([]);
    expect(meta.totalNotes).toBe(0);
    expect(meta.totalResearch).toBe(0);
    expect(meta.booksIncluded).toEqual([]);
  });
});

describe('groupByBook', () => {
  it('groups verses by bookId', () => {
    const data: VerseData[] = [
      makeVerseData({ id: 'gen_1_1', bookId: 'gen' }),
      makeVerseData({ id: 'gen_2_1', bookId: 'gen', chapter: 2 }),
      makeVerseData({ id: 'exo_1_1', bookId: 'exo' }),
    ];

    const grouped = groupByBook(data);
    expect(grouped['gen']).toHaveLength(2);
    expect(grouped['exo']).toHaveLength(1);
  });

  it('returns empty object for empty input', () => {
    expect(groupByBook([])).toEqual({});
  });
});
