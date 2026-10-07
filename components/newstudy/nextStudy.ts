/**
 * nextStudy.ts — where the next study starts · 下一课从哪里开始
 *
 * The New-study form opens on the passage that follows the leader's latest
 * pack (by its study date, then its last save): the verse after its last
 * verse, keeping the same length; past the chapter's end, verse 1 of the next
 * chapter; past the book's end, chapter 1 of the next book. The lesson number
 * follows the latest title's "第N课". With no pack yet, it opens on
 * FIRST_STUDY (Mark 1:1–15: the shortest Gospel, Jesus at the centre from the
 * first verse — a good first book for a new group).
 */
import type { StudyPack } from '../studypack/packTypes';
import { packPassage } from '../studypack/relatedVerses';
import { BIBLE_BOOKS, getBookById } from '../../services/bibleBookData';
import type { VerseRange } from './packAssembly';

/** The first study's passage when the leader has no pack yet. */
export const FIRST_STUDY: VerseRange = { bookId: 'MRK', chapter: 1, verseFrom: 1, verseTo: 15 };

/** "第3课 …" → 3; the lesson prefix packAssembly writes. */
const LESSON_PREFIX = /^第(\d+)课/;

/** Verse count of a chapter, or null when it cannot be loaded. */
export type VerseCounter = (bookId: string, chapter: number) => Promise<number | null>;

export interface NextStudy extends VerseRange {
  lessonNumber?: number;
}

/** The leader's most recent pack that has a passage: latest study date, then latest save. */
export function latestPack(packs: readonly StudyPack[]): StudyPack | null {
  const withPassage = packs.filter(p => packPassage(p) !== null);
  const key = (p: StudyPack) => `${p.date} ${p.updatedAt ?? ''}`;
  return withPassage.reduce<StudyPack | null>((best, p) => (best === null || key(p) > key(best) ? p : best), null);
}

/** The chapter after this one: the next chapter of the book, else chapter 1 of the next book (Revelation → Genesis). */
export function chapterAfter(bookId: string, chapter: number): { bookId: string; chapter: number } {
  const book = getBookById(bookId);
  if (book && chapter < book.chapters) return { bookId, chapter: chapter + 1 };
  const index = BIBLE_BOOKS.findIndex(b => b.id === bookId);
  return { bookId: BIBLE_BOOKS[(index + 1) % BIBLE_BOOKS.length].id, chapter: 1 };
}

/** The range after `prev`, the same length, clipped to its chapter. */
export async function rangeAfter(prev: VerseRange, verseCount: VerseCounter): Promise<VerseRange> {
  const length = prev.verseTo - prev.verseFrom + 1;
  const count = await verseCount(prev.bookId, prev.chapter);
  if (count !== null && prev.verseTo < count) {
    const verseFrom = prev.verseTo + 1;
    return { bookId: prev.bookId, chapter: prev.chapter, verseFrom, verseTo: Math.min(verseFrom + length - 1, count) };
  }
  const next = chapterAfter(prev.bookId, prev.chapter);
  const nextCount = await verseCount(next.bookId, next.chapter);
  return { ...next, verseFrom: 1, verseTo: nextCount === null ? length : Math.min(length, nextCount) };
}

/** The suggestion for the New-study form: after the latest pack, else FIRST_STUDY. */
export async function suggestNextStudy(packs: readonly StudyPack[], verseCount: VerseCounter): Promise<NextStudy> {
  const latest = latestPack(packs);
  const passage = latest ? packPassage(latest) : null;
  if (!latest || !passage) return FIRST_STUDY;
  const verses = [...passage.verses];
  const prev: VerseRange = { bookId: passage.bookId, chapter: passage.chapter, verseFrom: Math.min(...verses), verseTo: Math.max(...verses) };
  const lesson = LESSON_PREFIX.exec(latest.title);
  const range = await rangeAfter(prev, verseCount);
  return lesson ? { ...range, lessonNumber: Number(lesson[1]) + 1 } : range;
}
