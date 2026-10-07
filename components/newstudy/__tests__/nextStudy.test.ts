import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseStudyPack, StudyPack } from '../../studypack/packTypes';
import { TEST_PACK_PATH } from '../../studypack/__tests__/fixtures';
import { packPassage } from '../../studypack/relatedVerses';
import { FIRST_STUDY, chapterAfter, latestPack, rangeAfter, suggestNextStudy, VerseCounter } from '../nextStudy';

const base: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const pack = (patch: Partial<StudyPack>): StudyPack => ({ ...base, ...patch });
/** Verse counts for the chapters these tests touch (the real ones). */
const COUNTS: Record<string, number> = { 'MAT/6': 34, 'MAT/7': 29, 'MAT/28': 20, 'MRK/1': 45, 'REV/22': 21, 'GEN/1': 31 };
const counter: VerseCounter = async (b, c) => COUNTS[`${b}/${c}`] ?? null;

describe('rangeAfter', () => {
  it('continues in the same chapter, keeping the length', async () => {
    expect(await rangeAfter({ bookId: 'MAT', chapter: 6, verseFrom: 1, verseTo: 10 }, counter))
      .toEqual({ bookId: 'MAT', chapter: 6, verseFrom: 11, verseTo: 20 });
  });

  it('clips to the end of the chapter', async () => {
    expect(await rangeAfter({ bookId: 'MAT', chapter: 6, verseFrom: 16, verseTo: 30 }, counter))
      .toEqual({ bookId: 'MAT', chapter: 6, verseFrom: 31, verseTo: 34 });
  });

  it('moves to the next chapter after the last verse', async () => {
    expect(await rangeAfter({ bookId: 'MAT', chapter: 6, verseFrom: 25, verseTo: 34 }, counter))
      .toEqual({ bookId: 'MAT', chapter: 7, verseFrom: 1, verseTo: 10 });
  });

  it('moves to the next book after the last chapter, and Revelation wraps to Genesis', async () => {
    expect(await rangeAfter({ bookId: 'MAT', chapter: 28, verseFrom: 16, verseTo: 20 }, counter))
      .toEqual({ bookId: 'MRK', chapter: 1, verseFrom: 1, verseTo: 5 });
    expect(chapterAfter('REV', 22)).toEqual({ bookId: 'GEN', chapter: 1 });
  });
});

describe('suggestNextStudy', () => {
  it('no packs → Mark 1:1–15', async () => {
    expect(await suggestNextStudy([], counter)).toEqual(FIRST_STUDY);
  });

  it('follows the latest pack by study date and bumps "第N课"', async () => {
    const span = packPassage(base)!;
    const older = pack({ id: 'a', date: '2026-09-01', title: '第2课 旧' });
    const newer = pack({ id: 'b', date: '2026-10-02', title: '第3课 庄稼已经熟了' });
    expect(latestPack([newer, older])?.id).toBe('b');
    const next = await suggestNextStudy([older, newer], counter);
    expect(next.lessonNumber).toBe(4);
    const last = Math.max(...span.verses);
    expect(next.verseFrom === last + 1 || next.verseFrom === 1).toBe(true);
  });

  it('no lesson number when the latest title has none', async () => {
    expect((await suggestNextStudy([pack({ title: '庄稼已经熟了' })], counter)).lessonNumber).toBeUndefined();
  });
});
