/**
 * externalVerses.test.ts — ref resolution planning and the bundled-data
 * loader: in-pack refs stay synchronous, external refs fetch both bundled
 * chapters once (session cache), failures reject (the popup shows its
 * bilingual error line — no vacuous success).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { parseStudyPack, StudyPack } from '../packTypes';
import { findVerseRefs } from '../verseRefs';
import { planRef, planExternalRef, loadExternalVerses, clearExternalVerseCache } from '../externalVerses';
import { TEST_PACK_PATH } from './fixtures';

const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));

function ref(text: string) {
  const refs = findVerseRefs(text);
  expect(refs).toHaveLength(1);
  return refs[0];
}

function chapterJson(bookId: string, texts: Record<number, string>) {
  return {
    reference: `${bookId} x`,
    verses: Object.entries(texts).map(([verse, text]) => ({
      book_id: bookId, book_name: bookId, chapter: 4, verse: Number(verse), text,
    })),
  };
}

beforeEach(() => {
  clearExternalVerseCache();
  vi.unstubAllGlobals();
});

describe('planRef', () => {
  it('resolves fully in-pack refs synchronously from the pack', () => {
    const plan = planRef(ref('v.26'), pack)!;
    expect(plan.verses!.map(v => v.num)).toEqual([26]);
    expect(plan.load).toBeUndefined();
  });

  it('plans a bundled-data load for other books, other chapters and out-of-pack verses', () => {
    expect(planRef(ref('Philippians 4:6–7'), pack)!.load).toBeTypeOf('function');
    expect(planRef(ref('路加福音 12:22–31'), pack)!.load).toBeTypeOf('function');
    expect(planRef(ref('Matthew 5:3'), pack)!.load).toBeTypeOf('function');
    // v.24 is outside the embedded 25–34 but in the pack's book/chapter
    expect(planRef(ref('v.24'), pack)!.load).toBeTypeOf('function');
    // A range straddling the pack edge loads the whole range from bundled data
    expect(planRef(ref('vv.24–25'), pack)!.load).toBeTypeOf('function');
  });

  it('returns null for an unknown book (rendered plain)', () => {
    expect(planRef(ref('Narnia 3:1'), pack)).toBeNull();
  });
});

describe('planExternalRef (no pack context — landing captions)', () => {
  it('plans a bundled load for the hero captions, 繁體 and English', () => {
    for (const text of ['詩篇 147:4', 'Psalm 147:4', '創世記 1:3', 'Genesis 1:3']) {
      expect(planExternalRef(ref(text))!.load, text).toBeTypeOf('function');
    }
  });

  it('stays plain for bare v.N and unknown books', () => {
    expect(planExternalRef(ref('v.24'))).toBeNull();
    expect(planExternalRef(ref('Narnia 3:1'))).toBeNull();
  });
});

describe('loadExternalVerses', () => {
  it('combines 和合本 + BSB, Chinese first, and caches chapters per session', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const body = String(url).includes('/cuv/')
        ? chapterJson('PHP', { 6: '应当一无挂虑', 7: '神所赐出人意外的平安' })
        : chapterJson('PHP', { 6: 'Be anxious for nothing', 7: 'And the peace of God' });
      return { ok: true, json: async () => body };
    });
    vi.stubGlobal('fetch', fetchMock);

    const verses = await loadExternalVerses('PHP', 4, [6, 7]);
    expect(verses).toEqual([
      { num: 6, cuv: '应当一无挂虑', en: 'Be anxious for nothing' },
      { num: 7, cuv: '神所赐出人意外的平安', en: 'And the peace of God' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2); // cuv + bsb, once each

    // Second resolution of the same chapter: served from the cache.
    await loadExternalVerses('PHP', 4, [6]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects when neither bundled chapter can be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await expect(loadExternalVerses('PHP', 4, [6])).rejects.toThrow('unavailable');
  });

  it('rejects when the chapters load but none of the verses exist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => chapterJson('PHP', { 1: 'x' }),
    })));
    await expect(loadExternalVerses('PHP', 4, [99])).rejects.toThrow('No bundled text');
  });
});
