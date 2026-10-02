import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseStudyPack, StudyPack } from '../packTypes';
import { findVerseRefs, packVerseIndex, packChapter, packBookId, resolveRef, VerseRef } from '../verseRefs';

const PACK_PATH = path.resolve(__dirname, '../../../public/packs/2026-10-02-matt6.json');
const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(PACK_PATH, 'utf-8')));

function one(text: string): VerseRef {
  const refs = findVerseRefs(text);
  expect(refs).toHaveLength(1);
  return refs[0];
}

describe('findVerseRefs', () => {
  it('parses v.N', () => {
    expect(one('see v.24 here')).toMatchObject({ text: 'v.24', chapter: null, verses: [24] });
  });

  it('parses vv. lists and ranges (en dash and hyphen)', () => {
    expect(one('vv.25,31')).toMatchObject({ verses: [25, 31] });
    expect(one('vv.24–25')).toMatchObject({ verses: [24, 25] });
    expect(one('vv.24-25')).toMatchObject({ verses: [24, 25] });
    expect(one('vv.25, 27, 33')).toMatchObject({ verses: [25, 27, 33] });
  });

  it('parses English Book C:V with the canonical bookId, numbered books and ranges', () => {
    expect(one('Matthew 6:24')).toMatchObject({ bookId: 'MAT', chapter: 6, verses: [24] });
    expect(one('see 1 Peter 5:7')).toMatchObject({ bookId: '1PE', chapter: 5, verses: [7] });
    expect(one('Matthew 6:25–27')).toMatchObject({ bookId: 'MAT', chapter: 6, verses: [25, 26, 27] });
    expect(one('Luke 12:22–31')).toMatchObject({ bookId: 'LUK', chapter: 12,
      verses: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31] });
    expect(one('Philippians 4:6–7')).toMatchObject({ bookId: 'PHP', chapter: 4, verses: [6, 7] });
    expect(one('Psalm 55:22')).toMatchObject({ bookId: 'PSA', chapter: 55, verses: [22] });
  });

  it('parses Chinese book forms — abbreviations and full names, with ranges', () => {
    expect(one('太6:24')).toMatchObject({ bookId: 'MAT', chapter: 6, verses: [24] });
    expect(one('见 马太福音 6:24 一节')).toMatchObject({ bookId: 'MAT', chapter: 6, verses: [24] });
    expect(one('路加福音 12:22–31')).toMatchObject({ bookId: 'LUK', chapter: 12,
      verses: [22, 23, 24, 25, 26, 27, 28, 29, 30, 31] });
    expect(one('彼前5:7')).toMatchObject({ bookId: '1PE', chapter: 5, verses: [7] });
    expect(one('腓4:6')).toMatchObject({ bookId: 'PHP', chapter: 4, verses: [6] });
    expect(one('诗篇 55:22')).toMatchObject({ bookId: 'PSA', chapter: 55, verses: [22] });
  });

  it('marks an unknown book name with bookId null', () => {
    expect(one('Narnia 3:1')).toMatchObject({ bookId: null, chapter: 3, verses: [1] });
  });

  it('finds multiple refs in order with correct offsets', () => {
    const text = 'Jesus ties anxiety (v.25) to treasure, cf. Matthew 6:24 and vv.31–33.';
    const refs = findVerseRefs(text);
    expect(refs.map(r => r.text)).toEqual(['v.25', 'Matthew 6:24', 'vv.31–33']);
    for (const r of refs) {
      expect(text.slice(r.index, r.index + r.length)).toBe(r.text);
    }
  });

  it('matches nothing in plain prose', () => {
    expect(findVerseRefs('no references here, not even 6pm or verse talk')).toEqual([]);
  });
});

describe('pack resolution', () => {
  const index = packVerseIndex(pack);
  const chapter = packChapter(pack);

  it('indexes all embedded verses, reads chapter and book from passageRef', () => {
    expect(index.size).toBe(10);
    expect(chapter).toBe(6);
    expect(packBookId(pack)).toBe('MAT');
  });

  it('resolves in-pack refs to embedded verses (both forms)', () => {
    expect(resolveRef(one('v.26'), index, chapter).map(v => v.num)).toEqual([26]);
    expect(resolveRef(one('Matthew 6:27'), index, chapter).map(v => v.num)).toEqual([27]);
    expect(resolveRef(one('太6:33'), index, chapter).map(v => v.num)).toEqual([33]);
    expect(resolveRef(one('vv.33–34'), index, chapter).map(v => v.num)).toEqual([33, 34]);
  });

  it('returns empty for out-of-pack verses, other chapters and other books', () => {
    expect(resolveRef(one('v.24'), index, chapter)).toEqual([]);          // before the passage
    expect(resolveRef(one('Matthew 5:3'), index, chapter)).toEqual([]);   // chapter mismatch
    expect(resolveRef(one('太7:7'), index, chapter)).toEqual([]);
    // Same chapter number, different book: must NOT resolve from the pack
    expect(resolveRef(one('Luke 6:27'), index, chapter, 'MAT')).toEqual([]);
  });

  it('keeps the verses that are in the pack when a range straddles the edge', () => {
    expect(resolveRef(one('vv.24–25'), index, chapter).map(v => v.num)).toEqual([25]);
  });
});
