/**
 * refLabel.ts — bilingual popup header for a verse reference · 经文引用标题
 *
 * ADR-0003 §1: the VerseTooltip header is 简体 book name first, then
 * English: "诗篇 147:4 · Psalm 147:4". Book names come from the canonical
 * table (services/bibleBookData, R3); v./vv. refs borrow the passage's book
 * and chapter from the caller. Unresolvable refs fall back to the text as
 * written.
 */
import { BIBLE_BOOKS } from '../../services/bibleBookData';
import { bilingual } from './principles';
import { VerseRef } from './verseRefs';

const RANGE_DASH = '–';

/** [25,26,27,31] → "25–27,31". */
export function formatVerseList(verses: readonly number[]): string {
  const runs: string[] = [];
  let start = verses[0];
  let prev = verses[0];
  for (const v of verses.slice(1)) {
    if (v === prev + 1) { prev = v; continue; }
    runs.push(start === prev ? `${start}` : `${start}${RANGE_DASH}${prev}`);
    start = prev = v;
  }
  if (verses.length) runs.push(start === prev ? `${start}` : `${start}${RANGE_DASH}${prev}`);
  return runs.join(',');
}

/**
 * "诗篇 147:4 · Psalm 147:4" for a ref, using `bookId`/`chapter` from the
 * passage when the ref itself has none (v./vv. forms).
 */
export function bilingualRefLabel(
  ref: VerseRef,
  passageBookId: string | null = null,
  passageChapter: number | null = null
): string {
  const bookId = ref.bookId ?? passageBookId;
  const chapter = ref.chapter ?? passageChapter;
  const book = bookId ? BIBLE_BOOKS.find(b => b.id === bookId) : undefined;
  if (!book || !chapter || ref.verses.length === 0) return ref.text;
  const [zh, ...enParts] = book.name.split(' ');
  // The table names the book "Psalms"; a chapter reference reads "Psalm 147:4".
  const en = enParts.join(' ').replace(/^Psalms$/, 'Psalm');
  const cv = `${chapter}:${formatVerseList(ref.verses)}`;
  return bilingual(`${zh} ${cv} ·`, `${en} ${cv}`);
}
