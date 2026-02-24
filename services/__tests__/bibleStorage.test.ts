import { describe, it, expect, beforeEach } from 'vitest';
import { bibleStorage } from '../bibleStorage';

// fresh DB state before each test
beforeEach(async () => {
  await bibleStorage.init();
  await bibleStorage.clearAll();
});

describe('saveChapter / getChapter', () => {
  it('saves and retrieves a chapter', async () => {
    const verses = [{ verse: 1, text: 'In the beginning...' }];
    await bibleStorage.saveChapter('GEN', 1, 'cuv', verses);
    const result = await bibleStorage.getChapter('GEN', 1, 'cuv');
    expect(result).toEqual(verses);
  });

  it('returns null for a chapter that has not been saved', async () => {
    const result = await bibleStorage.getChapter('GEN', 999, 'cuv');
    expect(result).toBeNull();
  });

  it('distinguishes between translations for the same chapter', async () => {
    const cuvVerses = [{ verse: 1, text: '太初有道' }];
    const webVerses = [{ verse: 1, text: 'In the beginning was the Word' }];
    await bibleStorage.saveChapter('JHN', 1, 'cuv', cuvVerses);
    await bibleStorage.saveChapter('JHN', 1, 'web', webVerses);
    expect(await bibleStorage.getChapter('JHN', 1, 'cuv')).toEqual(cuvVerses);
    expect(await bibleStorage.getChapter('JHN', 1, 'web')).toEqual(webVerses);
  });

  it('overwrites existing chapter data', async () => {
    await bibleStorage.saveChapter('GEN', 1, 'cuv', [{ verse: 1, text: 'original' }]);
    await bibleStorage.saveChapter('GEN', 1, 'cuv', [{ verse: 1, text: 'updated' }]);
    const result = await bibleStorage.getChapter('GEN', 1, 'cuv');
    expect((result as any)[0].text).toBe('updated');
  });
});

describe('hasChapter', () => {
  it('returns false when neither translation is stored', async () => {
    expect(await bibleStorage.hasChapter('GEN', 1)).toBe(false);
  });

  it('returns false when only cuv is stored', async () => {
    await bibleStorage.saveChapter('GEN', 1, 'cuv', []);
    expect(await bibleStorage.hasChapter('GEN', 1)).toBe(false);
  });

  it('returns false when only web is stored', async () => {
    await bibleStorage.saveChapter('GEN', 1, 'web', []);
    expect(await bibleStorage.hasChapter('GEN', 1)).toBe(false);
  });

  it('returns true when both cuv and web are stored', async () => {
    await bibleStorage.saveChapter('GEN', 1, 'cuv', []);
    await bibleStorage.saveChapter('GEN', 1, 'web', []);
    expect(await bibleStorage.hasChapter('GEN', 1)).toBe(true);
  });
});

describe('hasChapterTranslation', () => {
  it('returns false when translation is not stored', async () => {
    expect(await bibleStorage.hasChapterTranslation('GEN', 1, 'cuv')).toBe(false);
  });

  it('returns true after saving that translation', async () => {
    await bibleStorage.saveChapter('PSA', 23, 'kjv', [{ verse: 1, text: 'The Lord is my shepherd' }]);
    expect(await bibleStorage.hasChapterTranslation('PSA', 23, 'kjv')).toBe(true);
  });

  it('does not confuse translations for the same chapter', async () => {
    await bibleStorage.saveChapter('PSA', 23, 'cuv', []);
    expect(await bibleStorage.hasChapterTranslation('PSA', 23, 'web')).toBe(false);
    expect(await bibleStorage.hasChapterTranslation('PSA', 23, 'cuv')).toBe(true);
  });
});

describe('getAllOfflineChapters', () => {
  it('returns empty set when nothing is stored', async () => {
    const result = await bibleStorage.getAllOfflineChapters();
    expect(result.size).toBe(0);
  });

  it('includes chapter when both cuv and web are stored', async () => {
    await bibleStorage.saveChapter('GEN', 1, 'cuv', []);
    await bibleStorage.saveChapter('GEN', 1, 'web', []);
    const result = await bibleStorage.getAllOfflineChapters();
    expect(result.has('GEN_1')).toBe(true);
  });

  it('excludes chapter when only one translation is stored', async () => {
    await bibleStorage.saveChapter('GEN', 2, 'cuv', []);
    const result = await bibleStorage.getAllOfflineChapters();
    expect(result.has('GEN_2')).toBe(false);
  });

  it('handles multiple chapters across books correctly', async () => {
    await bibleStorage.saveChapter('GEN', 1, 'cuv', []);
    await bibleStorage.saveChapter('GEN', 1, 'web', []);
    await bibleStorage.saveChapter('PSA', 23, 'cuv', []);
    await bibleStorage.saveChapter('PSA', 23, 'web', []);
    await bibleStorage.saveChapter('GEN', 2, 'cuv', []); // incomplete

    const result = await bibleStorage.getAllOfflineChapters();
    expect(result.has('GEN_1')).toBe(true);
    expect(result.has('PSA_23')).toBe(true);
    expect(result.has('GEN_2')).toBe(false);
    expect(result.size).toBe(2);
  });
});

describe('metadata operations', () => {
  it('saves and retrieves metadata', async () => {
    await bibleStorage.saveMetadata('downloadProgress', { pct: 50, book: 'GEN' });
    const result = await bibleStorage.getMetadata('downloadProgress');
    expect(result).toEqual({ pct: 50, book: 'GEN' });
  });

  it('returns null for a key that has not been set', async () => {
    expect(await bibleStorage.getMetadata('nonexistent')).toBeNull();
  });

  it('overwrites existing metadata', async () => {
    await bibleStorage.saveMetadata('key', 'first');
    await bibleStorage.saveMetadata('key', 'second');
    expect(await bibleStorage.getMetadata('key')).toBe('second');
  });

  it('deletes metadata and returns null afterward', async () => {
    await bibleStorage.saveMetadata('toDelete', 'value');
    await bibleStorage.deleteMetadata('toDelete');
    expect(await bibleStorage.getMetadata('toDelete')).toBeNull();
  });

  it('deleting a non-existent key does not throw', async () => {
    await expect(bibleStorage.deleteMetadata('missing')).resolves.not.toThrow();
  });
});

describe('clearAll', () => {
  it('removes all chapters', async () => {
    await bibleStorage.saveChapter('GEN', 1, 'cuv', [{ verse: 1, text: 'test' }]);
    await bibleStorage.clearAll();
    expect(await bibleStorage.getChapter('GEN', 1, 'cuv')).toBeNull();
  });

  it('removes all metadata', async () => {
    await bibleStorage.saveMetadata('key', 'value');
    await bibleStorage.clearAll();
    expect(await bibleStorage.getMetadata('key')).toBeNull();
  });

  it('leaves the DB in a working state', async () => {
    await bibleStorage.clearAll();
    await bibleStorage.saveChapter('REV', 22, 'web', []);
    expect(await bibleStorage.hasChapterTranslation('REV', 22, 'web')).toBe(true);
  });
});

describe('getAllChapters', () => {
  it('returns empty array when nothing is stored', async () => {
    expect(await bibleStorage.getAllChapters()).toEqual([]);
  });

  it('returns all stored chapters with correct shape', async () => {
    const verses = [{ verse: 1, text: 'test' }];
    await bibleStorage.saveChapter('GEN', 1, 'cuv', verses);
    await bibleStorage.saveChapter('GEN', 1, 'web', verses);

    const result = await bibleStorage.getAllChapters();
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bookId: 'GEN', chapter: 1, translation: 'cuv', data: verses }),
        expect.objectContaining({ bookId: 'GEN', chapter: 1, translation: 'web', data: verses }),
      ])
    );
  });
});

describe('getStorageInfo', () => {
  it('returns a numeric used and quota', async () => {
    const info = await bibleStorage.getStorageInfo();
    expect(typeof info.used).toBe('number');
    expect(typeof info.quota).toBe('number');
  });
});
