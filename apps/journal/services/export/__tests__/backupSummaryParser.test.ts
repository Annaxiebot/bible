import { describe, it, expect } from 'vitest';
import { parseBackupSummary } from '../backupSummaryParser';

describe('parseBackupSummary', () => {
  it('parses v3.0 backup summary', () => {
    const backup = {
      version: '3.0',
      exportDate: '2024-01-01T00:00:00.000Z',
      notes: {
        data: {
          'gen_1_1': { personalNote: { text: 'test' }, aiResearch: [{ id: '1' }] },
          'gen_1_2': { aiResearch: [] },
        },
      },
      annotations: [{ id: 'a1' }, { id: 'a2' }],
      bookmarks: [{ id: 'b1' }],
      readingHistory: { history: [{ bookId: 'gen', chapter: 1 }] },
      readingPlans: [{ id: 'p1' }],
      bibleTexts: { chapters: [{ bookId: 'gen', chapter: 1 }] },
    };

    const result = parseBackupSummary(JSON.stringify(backup));

    expect(result.version).toBe('3.0');
    expect(result.notes).toBe(1);
    expect(result.aiResearch).toBe(1);
    expect(result.annotations).toBe(2);
    expect(result.bookmarks).toBe(1);
    expect(result.historyEntries).toBe(1);
    expect(result.readingPlans).toBe(1);
    expect(result.bibleChapters).toBe(1);
  });

  it('parses v2.0 backup summary', () => {
    const backup = {
      version: '2.0',
      exportDate: '2024-01-01T00:00:00.000Z',
      notes: {
        data: {
          'gen_1_1': { personalNote: { text: 'note' }, aiResearch: [{ id: '1' }, { id: '2' }] },
        },
      },
      bibleTexts: { chapters: [{ bookId: 'gen', chapter: 1 }, { bookId: 'gen', chapter: 2 }] },
    };

    const result = parseBackupSummary(JSON.stringify(backup));

    expect(result.version).toBe('2.0');
    expect(result.notes).toBe(1);
    expect(result.aiResearch).toBe(2);
    expect(result.annotations).toBe(0);
    expect(result.bookmarks).toBe(0);
    expect(result.bibleChapters).toBe(2);
  });

  it('parses v1.0 notes-only backup summary', () => {
    const backup = {
      version: '1.0',
      exportDate: '2024-01-01T00:00:00.000Z',
      data: {
        'gen_1_1': { personalNote: { text: 'n1' }, aiResearch: [] },
        'gen_1_2': { personalNote: { text: 'n2' }, aiResearch: [{ id: '1' }] },
      },
    };

    const result = parseBackupSummary(JSON.stringify(backup));

    expect(result.version).toBe('1.0');
    expect(result.notes).toBe(2);
    expect(result.aiResearch).toBe(1);
  });

  it('returns empty summary for unrecognized format', () => {
    const result = parseBackupSummary(JSON.stringify({ version: '99.0' }));
    expect(result.notes).toBe(0);
    expect(result.aiResearch).toBe(0);
    expect(result.annotations).toBe(0);
  });

  it('handles missing nested data gracefully', () => {
    const backup = {
      version: '3.0',
      exportDate: '2024-01-01',
      notes: {},
      bibleTexts: {},
    };

    const result = parseBackupSummary(JSON.stringify(backup));
    expect(result.notes).toBe(0);
    expect(result.bibleChapters).toBe(0);
  });
});
