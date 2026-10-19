/**
 * bundledVerseParity.test.ts — invariant over the bundled Bible data · 经文数据不变式
 *
 * loadPassage treats a verse as out of range only when BOTH translations
 * miss it, so the guarantee a full-chapter pack relies on is: in every
 * bundled chapter, the UNION of 和合本 + BSB verse numbers is contiguous
 * 1..max (a gap on one side is a textual variant and must stay loadable).
 * Reads the JSON straight from disk — no fetch stub, no app code.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

const BIBLE_DATA = path.resolve(__dirname, '../../../public/bible-data');

function verseNums(translation: string, book: string, chapter: string): Set<number> {
  const file = path.join(BIBLE_DATA, translation, book, chapter);
  const data = JSON.parse(readFileSync(file, 'utf-8')) as { verses: { verse: number }[] };
  return new Set(data.verses.map(v => v.verse));
}

describe('bundled 和合本 + BSB verse parity', () => {
  const books = readdirSync(path.join(BIBLE_DATA, 'cuv'));
  it('covers every chapter of all 66 books', () => {
    expect(books).toHaveLength(66);
  });

  it('every chapter has a contiguous union of verse numbers (one-sided gaps allowed)', () => {
    const oneSided: string[] = [];
    const missingBoth: string[] = [];
    for (const book of books) {
      for (const chapter of readdirSync(path.join(BIBLE_DATA, 'cuv', book))) {
        const zh = verseNums('cuv', book, chapter);
        const en = verseNums('bsb', book, chapter);
        const max = Math.max(...zh, ...en);
        for (let num = 1; num <= max; num++) {
          const ref = `${book.toLowerCase()} ${chapter.replace('.json', '')}:${num}`;
          // Missing in both would make loadPassage reject a valid range.
          if (!zh.has(num) && !en.has(num)) missingBoth.push(ref);
          else if (zh.has(num) !== en.has(num)) oneSided.push(ref);
        }
      }
    }
    expect(missingBoth).toEqual([]);
    // The known textual variants are one-sided gaps, loadable with a note — John 5:4 is the canary.
    expect(oneSided).toContain('jhn 5:4');
  });
});
