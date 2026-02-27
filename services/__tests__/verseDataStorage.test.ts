import { describe, it, expect, beforeEach } from 'vitest';
import { verseDataStorage } from '../verseDataStorage';
import { PersonalNote, VerseData } from '../../types/verseData';

// Reset the singleton's DB between tests by clearing all data.
// fake-indexeddb (loaded via test/setup.ts) provides in-memory IDB.
beforeEach(async () => {
  await verseDataStorage.initialize();
  await verseDataStorage.clearAll();
});

// ---------------------------------------------------------------------------
// addAIResearch
// ---------------------------------------------------------------------------
describe('addAIResearch', () => {
  it('returns a non-empty string ID', async () => {
    const id = await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'What is the meaning of creation?',
      response: 'God created the heavens and the earth.',
      tags: [],
    });
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('persists the entry so getVerseData returns it', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'creation',
      response: 'In the beginning...',
      tags: ['genesis'],
    });

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data).not.toBeNull();
    expect(data!.aiResearch).toHaveLength(1);
    expect(data!.aiResearch[0].query).toBe('creation');
    expect(data!.aiResearch[0].response).toBe('In the beginning...');
    expect(data!.aiResearch[0].tags).toEqual(['genesis']);
  });

  it('assigns a generated id and timestamp to the entry', async () => {
    const before = Date.now();
    const researchId = await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'test',
      response: 'test response',
      tags: [],
    });
    const after = Date.now();

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    const entry = data!.aiResearch[0];
    expect(entry.id).toBe(researchId);
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
  });

  it('appends multiple entries for the same verse', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'first question',
      response: 'first answer',
      tags: [],
    });
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'second question',
      response: 'second answer',
      tags: [],
    });

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.aiResearch).toHaveLength(2);
  });

  it('creates a new verse record when none exists', async () => {
    const before = await verseDataStorage.getVerseData('JHN', 3, [16]);
    expect(before).toBeNull();

    await verseDataStorage.addAIResearch('JHN', 3, [16], {
      query: 'eternal life',
      response: 'God so loved the world',
      tags: [],
    });

    const after = await verseDataStorage.getVerseData('JHN', 3, [16]);
    expect(after).not.toBeNull();
    expect(after!.bookId).toBe('JHN');
    expect(after!.chapter).toBe(3);
    expect(after!.verses).toEqual([16]);
  });

  it('coexists with an existing personal note on the same verse', async () => {
    const note: PersonalNote = {
      text: 'My note',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await verseDataStorage.savePersonalNote('GEN', 1, [1], note);

    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'question',
      response: 'answer',
      tags: [],
    });

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.personalNote?.text).toBe('My note');
    expect(data!.aiResearch).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deleteAIResearch
// ---------------------------------------------------------------------------
describe('deleteAIResearch', () => {
  it('removes the specified entry by id', async () => {
    const id = await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'to delete',
      response: 'response',
      tags: [],
    });

    await verseDataStorage.deleteAIResearch('GEN', 1, [1], id);

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    // Record should be deleted entirely when no personal note exists
    expect(data).toBeNull();
  });

  it('leaves other entries intact when deleting one of several', async () => {
    const id1 = await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'first',
      response: 'first response',
      tags: [],
    });
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'second',
      response: 'second response',
      tags: [],
    });

    await verseDataStorage.deleteAIResearch('GEN', 1, [1], id1);

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.aiResearch).toHaveLength(1);
    expect(data!.aiResearch[0].query).toBe('second');
  });

  it('keeps the record if a personal note still exists', async () => {
    const id = await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'question',
      response: 'answer',
      tags: [],
    });
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'keep me',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await verseDataStorage.deleteAIResearch('GEN', 1, [1], id);

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data).not.toBeNull();
    expect(data!.personalNote?.text).toBe('keep me');
    expect(data!.aiResearch).toHaveLength(0);
  });

  it('does nothing when the id does not exist', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'real',
      response: 'real response',
      tags: [],
    });

    await expect(
      verseDataStorage.deleteAIResearch('GEN', 1, [1], 'nonexistent-id')
    ).resolves.not.toThrow();

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.aiResearch).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// savePersonalNote
// ---------------------------------------------------------------------------
describe('savePersonalNote', () => {
  it('creates a new record with the note', async () => {
    const note: PersonalNote = {
      text: 'Wonderful verse',
      createdAt: 1000,
      updatedAt: 1000,
    };
    await verseDataStorage.savePersonalNote('PSA', 23, [1], note);

    const data = await verseDataStorage.getVerseData('PSA', 23, [1]);
    expect(data!.personalNote?.text).toBe('Wonderful verse');
  });

  it('updates an existing note and preserves createdAt', async () => {
    const original: PersonalNote = {
      text: 'original',
      createdAt: 1000,
      updatedAt: 1000,
    };
    await verseDataStorage.savePersonalNote('PSA', 23, [1], original);

    const updated: PersonalNote = {
      text: 'updated text',
      createdAt: 9999,
      updatedAt: 9999,
    };
    await verseDataStorage.savePersonalNote('PSA', 23, [1], updated);

    const data = await verseDataStorage.getVerseData('PSA', 23, [1]);
    expect(data!.personalNote?.text).toBe('updated text');
    // createdAt should be the original value, not 9999
    expect(data!.personalNote?.createdAt).toBe(1000);
  });

  it('sets updatedAt to a recent timestamp', async () => {
    const before = Date.now();
    await verseDataStorage.savePersonalNote('PSA', 23, [1], {
      text: 'note',
      createdAt: 0,
      updatedAt: 0,
    });
    const after = Date.now();

    const data = await verseDataStorage.getVerseData('PSA', 23, [1]);
    expect(data!.personalNote?.updatedAt).toBeGreaterThanOrEqual(before);
    expect(data!.personalNote?.updatedAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// getVerseData
// ---------------------------------------------------------------------------
describe('getVerseData', () => {
  it('returns null when no data exists', async () => {
    const result = await verseDataStorage.getVerseData('REV', 22, [1]);
    expect(result).toBeNull();
  });

  it('returns the correct record for the given verse key', async () => {
    await verseDataStorage.addAIResearch('ROM', 8, [28], {
      query: 'all things work together',
      response: 'For those who love God',
      tags: [],
    });

    const data = await verseDataStorage.getVerseData('ROM', 8, [28]);
    expect(data!.bookId).toBe('ROM');
    expect(data!.chapter).toBe(8);
    expect(data!.verses).toEqual([28]);
  });

  it('handles multi-verse keys (verses sorted ascending)', async () => {
    await verseDataStorage.addAIResearch('JHN', 3, [16, 17], {
      query: 'salvation',
      response: 'For God so loved...',
      tags: [],
    });

    // Lookup with verses in reverse order — storage normalises them
    const data = await verseDataStorage.getVerseData('JHN', 3, [17, 16]);
    expect(data).not.toBeNull();
    expect(data!.verses).toEqual([16, 17]);
  });
});

// ---------------------------------------------------------------------------
// getChapterData (Map return)
// ---------------------------------------------------------------------------
describe('getChapterData', () => {
  it('returns an empty Map when no data exists for the chapter', async () => {
    const result = await verseDataStorage.getChapterData('GEN', 99);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('returns only entries for the requested chapter', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'chapter 1',
      response: 'answer 1',
      tags: [],
    });
    await verseDataStorage.addAIResearch('GEN', 2, [1], {
      query: 'chapter 2',
      response: 'answer 2',
      tags: [],
    });

    const chapter1 = await verseDataStorage.getChapterData('GEN', 1);
    expect(chapter1.size).toBe(1);
    const [, entry] = [...chapter1.entries()][0];
    expect(entry.chapter).toBe(1);
  });

  it('keys the Map by the verse record id', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'verse 1',
      response: 'r1',
      tags: [],
    });
    await verseDataStorage.addAIResearch('GEN', 1, [2], {
      query: 'verse 2',
      response: 'r2',
      tags: [],
    });

    const result = await verseDataStorage.getChapterData('GEN', 1);
    expect(result.size).toBe(2);
    expect(result.has('GEN:1:1')).toBe(true);
    expect(result.has('GEN:1:2')).toBe(true);
  });

  it('does not include entries from a different book', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'genesis',
      response: 'answer',
      tags: [],
    });
    await verseDataStorage.addAIResearch('EXO', 1, [1], {
      query: 'exodus',
      response: 'answer',
      tags: [],
    });

    const result = await verseDataStorage.getChapterData('GEN', 1);
    expect(result.size).toBe(1);
    expect([...result.keys()][0]).toMatch(/^GEN:/);
  });
});

// ---------------------------------------------------------------------------
// searchNotes
// ---------------------------------------------------------------------------
describe('searchNotes', () => {
  it('returns empty array when there are no notes', async () => {
    const results = await verseDataStorage.searchNotes('anything');
    expect(results).toEqual([]);
  });

  it('finds records whose personal note contains the search term', async () => {
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'amazing creation story',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await verseDataStorage.savePersonalNote('JHN', 3, [16], {
      text: 'salvation through faith',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const results = await verseDataStorage.searchNotes('creation');
    expect(results).toHaveLength(1);
    expect(results[0].bookId).toBe('GEN');
  });

  it('is case-insensitive', async () => {
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'Amazing Creation',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const results = await verseDataStorage.searchNotes('amazing creation');
    expect(results).toHaveLength(1);
  });

  it('does not match against AI research content', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'unique-term-in-research',
      response: 'unique-term-in-research response',
      tags: [],
    });

    const results = await verseDataStorage.searchNotes('unique-term-in-research');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// searchResearch
// ---------------------------------------------------------------------------
describe('searchResearch', () => {
  it('returns empty array when there is no research', async () => {
    const results = await verseDataStorage.searchResearch('anything');
    expect(results).toEqual([]);
  });

  it('finds records by matching query text', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'meaning of creation',
      response: 'unrelated answer',
      tags: [],
    });

    const results = await verseDataStorage.searchResearch('meaning of creation');
    expect(results).toHaveLength(1);
  });

  it('finds records by matching response text', async () => {
    await verseDataStorage.addAIResearch('JHN', 3, [16], {
      query: 'unrelated query',
      response: 'specific insight about grace',
      tags: [],
    });

    const results = await verseDataStorage.searchResearch('specific insight');
    expect(results).toHaveLength(1);
  });

  it('finds records by matching tags', async () => {
    await verseDataStorage.addAIResearch('ROM', 8, [28], {
      query: 'providence',
      response: 'some answer',
      tags: ['sovereignty', 'comfort'],
    });

    const results = await verseDataStorage.searchResearch('sovereignty');
    expect(results).toHaveLength(1);
  });

  it('is case-insensitive', async () => {
    await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'Case Sensitive Query',
      response: 'answer',
      tags: [],
    });

    const results = await verseDataStorage.searchResearch('case sensitive query');
    expect(results).toHaveLength(1);
  });

  it('does not match against personal note text', async () => {
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'unique-note-term',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const results = await verseDataStorage.searchResearch('unique-note-term');
    expect(results).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// importData merge strategy
// ---------------------------------------------------------------------------
describe('importData merge strategy', () => {
  const makeVerseData = (
    bookId: string,
    chapter: number,
    verse: number,
    noteText: string,
    researchQuery: string
  ): VerseData => ({
    id: `${bookId}:${chapter}:${verse}`,
    bookId,
    chapter,
    verses: [verse],
    personalNote: {
      text: noteText,
      createdAt: 1000,
      updatedAt: 2000,
    },
    aiResearch: [
      {
        id: `ai_${researchQuery}`,
        query: researchQuery,
        response: 'response text',
        timestamp: 3000,
        tags: [],
      },
    ],
  });

  it("inserts new records that don't already exist", async () => {
    const incoming: VerseData[] = [makeVerseData('GEN', 1, 1, 'new note', 'new query')];
    await verseDataStorage.importData(incoming, 'merge');

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.personalNote?.text).toBe('new note');
    expect(data!.aiResearch).toHaveLength(1);
  });

  it('merge strategy keeps the newer personal note', async () => {
    // Existing note with updatedAt = 5000
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'existing note',
      createdAt: 1000,
      updatedAt: 5000,
    });

    // Incoming note with updatedAt = 3000 (older) — should be discarded
    const incomingOlder: VerseData[] = [makeVerseData('GEN', 1, 1, 'incoming old note', 'query')];
    incomingOlder[0].personalNote!.updatedAt = 3000;
    await verseDataStorage.importData(incomingOlder, 'merge');

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.personalNote?.text).toBe('existing note');
  });

  it('merge strategy replaces personal note when incoming is newer', async () => {
    const oldTimestamp = 1_000_000;
    const newTimestamp = 9_000_000_000_000; // far future — definitely newer
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'old note',
      createdAt: oldTimestamp,
      updatedAt: oldTimestamp,
    });

    const incomingNewer: VerseData[] = [makeVerseData('GEN', 1, 1, 'newer note', 'query')];
    incomingNewer[0].personalNote!.createdAt = newTimestamp;
    incomingNewer[0].personalNote!.updatedAt = newTimestamp;
    await verseDataStorage.importData(incomingNewer, 'merge');

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.personalNote?.text).toBe('newer note');
  });

  it('merge strategy combines AI research without duplicating existing entries', async () => {
    // Add one entry locally
    const existingId = await verseDataStorage.addAIResearch('GEN', 1, [1], {
      query: 'existing query',
      response: 'existing response',
      tags: [],
    });

    // Incoming data has the same entry plus one new entry
    const incoming: VerseData[] = [
      {
        id: 'GEN:1:1',
        bookId: 'GEN',
        chapter: 1,
        verses: [1],
        aiResearch: [
          {
            id: existingId,       // same id — should not be duplicated
            query: 'existing query',
            response: 'existing response',
            timestamp: 1000,
            tags: [],
          },
          {
            id: 'ai_brand_new',   // new entry
            query: 'brand new query',
            response: 'brand new response',
            timestamp: 2000,
            tags: [],
          },
        ],
      },
    ];

    await verseDataStorage.importData(incoming, 'merge');

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.aiResearch).toHaveLength(2);
    const queries = data!.aiResearch.map(r => r.query);
    expect(queries).toContain('existing query');
    expect(queries).toContain('brand new query');
  });

  it('replace strategy overwrites existing data completely', async () => {
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'will be replaced',
      createdAt: 1000,
      updatedAt: 1000,
    });

    const incoming: VerseData[] = [makeVerseData('GEN', 1, 1, 'replacement', 'replaced query')];
    await verseDataStorage.importData(incoming, 'replace');

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.personalNote?.text).toBe('replacement');
  });

  it('skip strategy does not modify existing records', async () => {
    await verseDataStorage.savePersonalNote('GEN', 1, [1], {
      text: 'keep this',
      createdAt: 1000,
      updatedAt: 1000,
    });

    const incoming: VerseData[] = [makeVerseData('GEN', 1, 1, 'should be ignored', 'query')];
    await verseDataStorage.importData(incoming, 'skip');

    const data = await verseDataStorage.getVerseData('GEN', 1, [1]);
    expect(data!.personalNote?.text).toBe('keep this');
  });
});
