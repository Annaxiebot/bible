/**
 * verseRefs.ts — find verse references in slide/answer text · 经文引用解析
 *
 * Recognizes "v.24", "vv.25,31", "vv.24–25", "Matthew 6:24", "1 Peter 5:7",
 * "太6:24", "彼前5:7", "马太福音 6:24" — with ranges. Book names resolve
 * against the app's canonical book table (services/bibleBookData.ts — R3,
 * no second book list). In-pack verses resolve from the pack; cross-book/
 * chapter refs carry a bookId so the caller can resolve them from the
 * bundled Bible data (ADR-0003 §8: every reference is interactive).
 */
import { StudyPack, PackVerse } from './packTypes';
import { BIBLE_BOOKS, CHINESE_ABBREV_TO_BOOK_ID } from '../../services/bibleBookData';

export interface VerseRef {
  index: number;      // start offset in the source text
  length: number;     // matched length
  text: string;       // the matched reference as written
  bookId: string | null;  // canonical book id for Book C:V forms, else null
  chapter: number | null; // chapter for Book C:V forms, null for v./vv. forms
  verses: number[];   // referenced verse numbers (ranges expanded)
}

// One alternation per supported shape: v./vv. lists+ranges, English Book C:V,
// CJK book C:V. Dashes: hyphen, en dash, em dash.
const REF_PATTERN =
  /vv?\.\s?\d+(?:\s?[–—-]\s?\d+)?(?:\s?,\s?\d+(?:\s?[–—-]\s?\d+)?)*|(?:[1-3]\s?)?[A-Za-z]+\.?\s?\d+:\d+(?:[–—-]\d+)?|[一-鿿]{1,8}\s?\d+:\d+(?:[–—-]\d+)?/g;

/** English book name (lowercased, no dots) → book id, from the app's table. */
const EN_NAME_TO_ID: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const book of BIBLE_BOOKS) {
    map.set(book.name.split(' ').slice(1).join(' ').toLowerCase(), book.id);
    map.set(book.id.toLowerCase(), book.id);
  }
  map.set('psalm', 'PSA'); // common singular form
  return map;
})();

function expandRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let v = from; v <= to && out.length < 200; v++) out.push(v);
  return out;
}

/** "25,31" / "24–25" / "27" → expanded verse numbers. */
function parseVerseList(list: string): number[] {
  const verses: number[] = [];
  for (const part of list.split(',')) {
    const range = /(\d+)\s?[–—-]\s?(\d+)/.exec(part);
    if (range) {
      verses.push(...expandRange(Number(range[1]), Number(range[2])));
    } else {
      const single = /\d+/.exec(part);
      if (single) verses.push(Number(single[0]));
    }
  }
  return verses;
}

/** Book-name prefix of a "Book C:V" match → canonical book id, or null. */
function lookupBookId(namePart: string): string | null {
  const name = namePart.replace(/[.\s]+$/, '').trim();
  if (!name) return null;
  return (
    CHINESE_ABBREV_TO_BOOK_ID[name] ??
    EN_NAME_TO_ID.get(name.replace(/\./g, '').replace(/\s+/g, ' ').toLowerCase()) ??
    null
  );
}

function parseMatch(text: string): Pick<VerseRef, 'bookId' | 'chapter' | 'verses'> {
  const bookForm = /^(.*?)(\d+):(\d+(?:[–—-]\d+)?)$/.exec(text);
  if (bookForm && !text.startsWith('v.') && !text.startsWith('vv.')) {
    return {
      bookId: lookupBookId(bookForm[1]),
      chapter: Number(bookForm[2]),
      verses: parseVerseList(bookForm[3]),
    };
  }
  return { bookId: null, chapter: null, verses: parseVerseList(text.replace(/^vv?\./, '')) };
}

/** All verse references in `text`, in order of appearance. */
export function findVerseRefs(text: string): VerseRef[] {
  const refs: VerseRef[] = [];
  for (const m of text.matchAll(REF_PATTERN)) {
    refs.push({ index: m.index ?? 0, length: m[0].length, text: m[0], ...parseMatch(m[0]) });
  }
  return refs;
}

/** Verse number → embedded verse, across all scripture sections of the pack. */
export function packVerseIndex(pack: StudyPack): Map<number, PackVerse> {
  const index = new Map<number, PackVerse>();
  for (const section of pack.sections) {
    if (section.kind !== 'scripture' || !section.verses) continue;
    for (const v of section.verses) index.set(v.num, v);
  }
  return index;
}

/** The pack's chapter number, from passageRef (e.g. "马太福音 6:25–34 …" → 6). */
export function packChapter(pack: StudyPack): number | null {
  const m = /(\d+):\d+/.exec(pack.passageRef);
  return m ? Number(m[1]) : null;
}

/** The pack's canonical book id, from the first book-form ref in passageRef. */
export function packBookId(pack: StudyPack): string | null {
  for (const ref of findVerseRefs(pack.passageRef)) {
    if (ref.bookId) return ref.bookId;
  }
  return null;
}

/**
 * The pack verses a reference points at. Empty when the ref names another
 * book/chapter or verses outside the embedded passage (the caller then
 * resolves those from the bundled Bible data instead).
 */
export function resolveRef(
  ref: VerseRef,
  index: Map<number, PackVerse>,
  chapter: number | null,
  bookId: string | null = null
): PackVerse[] {
  if (ref.bookId !== null && bookId !== null && ref.bookId !== bookId) return [];
  if (ref.chapter !== null && chapter !== null && ref.chapter !== chapter) return [];
  return ref.verses
    .map(num => index.get(num))
    .filter((v): v is PackVerse => v !== undefined);
}
