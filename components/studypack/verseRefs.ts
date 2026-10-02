/**
 * verseRefs.ts — find verse references in AI answer text · 经文引用解析
 *
 * Recognizes "v.24", "vv.25,31", "vv.24–25", "Matthew 6:24", "太6:24",
 * "马太福音 6:24". Resolution is strictly against the CURRENT pack's embedded
 * verses — no network lookups; unresolvable refs stay plain text.
 */
import { StudyPack, PackVerse } from './packTypes';

export interface VerseRef {
  index: number;      // start offset in the source text
  length: number;     // matched length
  text: string;       // the matched reference as written
  chapter: number | null; // chapter for Book C:V forms, null for v./vv. forms
  verses: number[];   // referenced verse numbers (ranges expanded)
}

// One alternation per supported shape: v./vv. lists+ranges, English Book C:V,
// CJK book C:V. Dashes: hyphen, en dash, em dash.
const REF_PATTERN =
  /vv?\.\s?\d+(?:\s?[–—-]\s?\d+)?(?:\s?,\s?\d+(?:\s?[–—-]\s?\d+)?)*|(?:[1-3]\s?)?[A-Za-z]+\.?\s?\d+:\d+(?:[–—-]\d+)?|[一-鿿]{1,8}\s?\d+:\d+(?:[–—-]\d+)?/g;

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

function parseMatch(text: string): Pick<VerseRef, 'chapter' | 'verses'> {
  const bookForm = /(\d+):(\d+(?:[–—-]\d+)?)$/.exec(text);
  if (bookForm) {
    return { chapter: Number(bookForm[1]), verses: parseVerseList(bookForm[2]) };
  }
  return { chapter: null, verses: parseVerseList(text.replace(/^vv?\./, '')) };
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

/** The pack's chapter number, from passageRef (e.g. "Matthew 6:25–34 …" → 6). */
export function packChapter(pack: StudyPack): number | null {
  const m = /(\d+):\d+/.exec(pack.passageRef);
  return m ? Number(m[1]) : null;
}

/**
 * The pack verses a reference points at. Empty when the ref names another
 * chapter/book or verses outside the embedded passage (render those plain).
 */
export function resolveRef(
  ref: VerseRef,
  index: Map<number, PackVerse>,
  chapter: number | null
): PackVerse[] {
  if (ref.chapter !== null && chapter !== null && ref.chapter !== chapter) return [];
  return ref.verses
    .map(num => index.get(num))
    .filter((v): v is PackVerse => v !== undefined);
}
