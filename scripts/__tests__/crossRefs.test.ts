/**
 * crossRefs.test.ts — the OpenBible.info parser + the committed xref files (ADR-0015 §1–2).
 *
 * Fixture lines copy the real source format (header with the CC-BY notice,
 * OSIS ids, ranges, zero/negative votes). The book pairing is pinned against
 * the app's one book table (services/bibleBookData.ts, R3); the last block
 * reads the generated public/bible-data/xref/ files themselves.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BIBLE_BOOKS } from '../../services/bibleBookData';
import { loadBooks } from '../lib/books.mjs';
import {
  OSIS_BOOK_ORDER, osisToAppIds, parseOsisVerse, compactTarget, parseLine, buildChapters,
} from '../lib/crossRefs.mjs';

const osis = osisToAppIds(BIBLE_BOOKS);
const lastVerse = (book: string, chapter: number) => ({ 'HEB/6': 20, 'GEN/11': 32 } as Record<string, number>)[`${book}/${chapter}`] ?? 99;

const FIXTURE = [
  'From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY 2026-10-05',
  'Gen.1.1\tIsa.40.28\t67',
  'Gen.1.1\tRev.4.11\t205',
  'Gen.1.1\tJohn.1.1-John.1.3\t379',
  'Gen.1.1\tPs.33.6\t0',
  'Gen.1.1\tJob.38.4\t-3',
  'Gen.14.18\tHeb.6.20-Heb.7.3\t18',
  'Gen.14.18\tHeb.6.20\t4',
  'Prov.1.7\tPs.111.10\t120',
].join('\n');

describe('OSIS → app book ids', () => {
  it('pairs the 66 OSIS ids with BIBLE_BOOKS in order, and books.mjs reads the same table', async () => {
    expect(OSIS_BOOK_ORDER).toHaveLength(66);
    expect(new Set(OSIS_BOOK_ORDER).size).toBe(66);
    expect((await loadBooks()).map((b: { id: string }) => b.id)).toEqual(BIBLE_BOOKS.map(b => b.id));
    const spot: Record<string, string> = {
      Gen: 'GEN', Ps: 'PSA', Prov: 'PRO', Song: 'SNG', Ezek: 'EZK', Joel: 'JOL', Nah: 'NAM', Mal: 'MAL',
      Matt: 'MAT', Mark: 'MRK', John: 'JHN', Phil: 'PHP', Phlm: 'PHM', Jas: 'JAS', '1John': '1JN', '3John': '3JN', Jude: 'JUD', Rev: 'REV',
    };
    for (const [o, id] of Object.entries(spot)) expect(osis.get(o), o).toBe(id);
  });

  it('throws on an unknown book or a malformed id (no silent drop)', () => {
    expect(() => parseOsisVerse('Tob.1.1', osis)).toThrow(/Unknown OSIS book/);
    expect(() => parseOsisVerse('Gen1:1', osis)).toThrow(/Not an OSIS verse id/);
    expect(() => parseLine('Gen.1.1\tIsa.40.28')).toThrow(/Malformed/);
  });
});

describe('compactTarget', () => {
  it('writes one verse, a same-chapter range, and cuts a cross-chapter range at the start chapter', () => {
    expect(compactTarget('Isa.40.28', osis, lastVerse)).toBe('ISA.40.28');
    expect(compactTarget('John.1.1-John.1.3', osis, lastVerse)).toBe('JHN.1.1-3');
    expect(compactTarget('Heb.6.20-Heb.7.3', osis, lastVerse)).toBe('HEB.6.20');
    expect(compactTarget('Gen.11.31-Gen.12.1', osis, lastVerse)).toBe('GEN.11.31-32');
  });
});

describe('buildChapters', () => {
  it('drops votes below the minimum, ranks by votes, keeps a compact ref once', () => {
    const { chapters, stats } = buildChapters(FIXTURE, osis, lastVerse);
    expect(stats).toEqual({ lines: 8, dropped: 2, kept: 5 });
    expect(chapters.get('GEN/1')).toEqual({ 1: [['JHN.1.1-3', 379], ['REV.4.11', 205], ['ISA.40.28', 67]] });
    expect(chapters.get('GEN/14')).toEqual({ 18: [['HEB.6.20', 18]] });
    expect(chapters.get('PRO/1')).toEqual({ 7: [['PSA.111.10', 120]] });
  });

  it('keeps at most perVerse links per verse', () => {
    const { chapters } = buildChapters(FIXTURE, osis, lastVerse, { perVerse: 1 });
    expect(chapters.get('GEN/1')).toEqual({ 1: [['JHN.1.1-3', 379]] });
  });
});

describe('the committed public/bible-data/xref files', () => {
  const ROOT = path.resolve(__dirname, '../../public/bible-data/xref');
  const REF = /^([1-3A-Z]{3})\.(\d+)\.(\d+)(?:-(\d+))?$/;

  it('cover every chapter of the book table, and every link names a real book and chapter', () => {
    const chapters = new Map(BIBLE_BOOKS.map(b => [b.id, b.chapters]));
    let links = 0;
    for (const book of BIBLE_BOOKS) {
      for (let ch = 1; ch <= book.chapters; ch++) {
        const file = path.join(ROOT, book.id, `${ch}.json`);
        expect(existsSync(file), file).toBe(true);
        const data = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, Array<[string, number]>>;
        for (const list of Object.values(data)) {
          expect(list.length).toBeLessThanOrEqual(10);
          for (const [ref, votes] of list) {
            const m = REF.exec(ref);
            expect(m, ref).not.toBeNull();
            expect(Number(m![2])).toBeLessThanOrEqual(chapters.get(m![1]) ?? 0);
            if (m![4]) expect(Number(m![4])).toBeGreaterThan(Number(m![3]));
            expect(votes).toBeGreaterThanOrEqual(1);
            links++;
          }
        }
      }
    }
    expect(links).toBeGreaterThan(200_000);
  });
});
