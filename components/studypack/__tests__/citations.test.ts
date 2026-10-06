/**
 * citations.test.ts — the CitationValidator verdicts against the real
 * bundled chapters (roadmap P1): valid / invalid chapter / invalid verse /
 * unknown book, bare in-chapter refs, Chinese and English forms; the TV
 * cited-block selection (valid, outside the pack, ≤3 refs, ≤3 verses).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { parseStudyPack, StudyPack } from '../packTypes';
import { findVerseRefs } from '../verseRefs';
import { clearExternalVerseCache } from '../externalVerses';
import {
  checkRef, checkAnswerRefs, precheckRef, pickCitedRefs, loadCitedRefs, MAX_CITED_REFS, MAX_CITED_VERSES,
} from '../citations';
import { TEST_PACK_PATH } from './fixtures';
import { stubBundledFetch } from './bundledFetch';

// The sample pack: 马太福音 6:25–34 embedded.
const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));

function ref(text: string) {
  const refs = findVerseRefs(text);
  expect(refs, text).toHaveLength(1);
  return refs[0];
}

async function verdict(text: string) {
  return (await checkRef(ref(text), pack)).verdict;
}

beforeEach(() => {
  clearExternalVerseCache();
  vi.unstubAllGlobals();
  stubBundledFetch();
});

describe('checkRef', () => {
  it('accepts a real cross-reference in Chinese (full, short, 繁體) and English', async () => {
    for (const text of ['希伯来书 5:14', '来5:14', 'Hebrews 5:14', '約翰福音 3:16']) {
      expect(await verdict(text), text).toBe('valid');
    }
  });

  it('rejects a chapter beyond the book synchronously (no chapter load)', async () => {
    const fetchMock = stubBundledFetch();
    expect(precheckRef(ref('Hebrews 14:1'), pack)).toEqual({ verdict: 'invalid' });
    expect(await verdict('希伯来书 14:1')).toBe('invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a verse beyond the chapter, also at the end of a range', async () => {
    expect(await verdict('John 3:99')).toBe('invalid');
    expect(await verdict('约翰福音 3:35–37')).toBe('invalid'); // John 3 has 36 verses
    expect(await verdict('约翰福音 3:35–36')).toBe('valid');
  });

  it('rejects an unknown book', async () => {
    expect(await verdict('Narnia 3:1')).toBe('invalid');
  });

  it('bare refs check against the pack chapter: embedded, in the chapter only, beyond it', async () => {
    expect(await verdict('v.26')).toBe('valid');   // embedded
    expect(await verdict('第24节')).toBe('valid');  // Matthew 6:24, not embedded
    expect(await verdict('v.40')).toBe('invalid'); // Matthew 6 has 34 verses
  });

  it('is unknown — never invalid — when the chapter file cannot be loaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    expect(await verdict('Hebrews 5:14')).toBe('unknown');
  });
});

describe('cited refs (TV block)', () => {
  it('keeps valid refs outside the pack only, one per label', async () => {
    const checked = await checkAnswerRefs('v.26 · 来5:14 · Hebrews 5:14 · John 3:99 · 太6:24', pack);
    expect(pickCitedRefs(checked, pack).map(c => c.ref.text)).toEqual(['来5:14', '太6:24']);
  });

  it(`stops at ${MAX_CITED_REFS} refs and ${MAX_CITED_VERSES} verses per ref, with real 和合本 + BSB text`, async () => {
    const checked = await checkAnswerRefs('Hebrews 5:12–14, John 3:16–20, Romans 8:28, Psalm 23:1', pack);
    const cited = await loadCitedRefs(checked, pack);
    expect(cited.map(c => c.label)).toEqual([
      '希伯来书 5:12–14 · Hebrews 5:12–14', '约翰福音 3:16–20 · John 3:16–20', '罗马书 8:28 · Romans 8:28',
    ]);
    expect(cited[0].verses.map(v => v.num)).toEqual([12, 13, 14]);
    expect(cited[0].more).toBe(false);
    expect(cited[0].verses[2].cuv).toContain('惟独长大成人的');
    expect(cited[1].verses.map(v => v.num)).toEqual([16, 17, 18]);
    expect(cited[1].more).toBe(true);
    expect(cited[2].verses[0].en.length).toBeGreaterThan(0); // BSB text present
  });
});
