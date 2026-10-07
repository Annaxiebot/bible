/**
 * guidePassage.ts — which passage a study guide studies · 讲义的经文 (ADR-0019 §2)
 *
 * The guide's text goes through the app's one reference finder
 * (studypack/verseRefs findVerseRefs + the canonical book table, R3) after
 * full-width digits, "：" and "～" are mapped to ASCII. "Book C:V[-V]"
 * forms count, and so does the heading form "N 章 A-B 節" whose book is
 * named apart from it ("約翰福音查經 … 第十課（4 章 27-42 節）"): its book is
 * the nearest full book name before it, else the guide's most named book.
 * A bare "v.7" names no passage. The most prominent reference
 * wins: a range beats a single verse, one in the title area (the first
 * TITLE_ZONE_CHARS) beats one further down, and repetition counts. The
 * result only pre-fills the form — the leader always confirms; `confident`
 * is false when nothing was found, the best is a single verse, or two
 * different passages tie.
 */
import { findBookNames, findVerseRefs } from '../../studypack/verseRefs';
import { getBookById } from '../../../services/bibleBookData';
import type { VerseRange } from '../packAssembly';

export interface GuidePassage {
  /** The best guess, or null when the guide names no passage. */
  range: VerseRange | null;
  confident: boolean;
}

/** The title area: a guide names its passage in its heading. */
export const TITLE_ZONE_CHARS = 300;
const RANGE_SCORE = 4;
const TITLE_SCORE = 2;

/** Full-width digits / colon / tilde and wave dashes → their ASCII forms, so "马可福音１：１～１５" is found. */
export function normaliseRefText(text: string): string {
  return text
    .replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFF10 + 0x30))
    .replace(/：/g, ':')
    .replace(/[～〜~－]/g, '-');
}

interface Candidate { range: VerseRange; score: number }

const keyOf = (r: VerseRange) => `${r.bookId} ${r.chapter}:${r.verseFrom}-${r.verseTo}`;

/** "4 章 27-42 節" / "4章27至42节" / "第4章第27节" — chapter and verses with the book named elsewhere. */
const CHAPTER_VERSE_FORM = /第?\s*(\d+)\s*章\s*第?\s*(\d+)(?:\s*[-–—至到]\s*(\d+))?\s*[節节]/g;

interface FoundRef { index: number; bookId: string | null; chapter: number | null; verses: number[] }

/** The 章/節 heading forms, each given the nearest full book name before it (else the most named one). */
function chapterVerseRefs(text: string): FoundRef[] {
  const books = findBookNames(text);
  if (books.length === 0) return [];
  const counts = new Map<string, number>();
  for (const b of books) counts.set(b.bookId, (counts.get(b.bookId) ?? 0) + 1);
  const mostNamed = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return [...text.matchAll(CHAPTER_VERSE_FORM)].map(m => {
    const index = m.index ?? 0;
    const before = books.filter(b => b.index < index).at(-1);
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    return { index, bookId: before?.bookId ?? mostNamed, chapter: Number(m[1]), verses: to >= from ? [from, to] : [from] };
  });
}

function candidates(text: string): Candidate[] {
  const byKey = new Map<string, Candidate>();
  const normal = normaliseRefText(text);
  for (const ref of [...findVerseRefs(normal), ...chapterVerseRefs(normal)]) {
    if (!ref.bookId || ref.chapter === null || ref.verses.length === 0) continue;
    const book = getBookById(ref.bookId);
    if (!book || ref.chapter < 1 || ref.chapter > book.chapters) continue;
    const range = { bookId: ref.bookId, chapter: ref.chapter, verseFrom: Math.min(...ref.verses), verseTo: Math.max(...ref.verses) };
    const key = keyOf(range);
    const seen = byKey.get(key);
    const first = seen ? 0 : (range.verseTo > range.verseFrom ? RANGE_SCORE : 0) + (ref.index < TITLE_ZONE_CHARS ? TITLE_SCORE : 0);
    byKey.set(key, { range, score: (seen?.score ?? 0) + first + 1 });
  }
  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

/** The guide's passage: the best-scoring reference and whether it is clear-cut. */
export function detectGuidePassage(text: string): GuidePassage {
  const [best, second] = candidates(text);
  if (!best) return { range: null, confident: false };
  const isRange = best.range.verseTo > best.range.verseFrom;
  const tied = second !== undefined && second.score === best.score;
  return { range: best.range, confident: isRange && !tied };
}
