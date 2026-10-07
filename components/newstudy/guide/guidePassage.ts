/**
 * guidePassage.ts — which passage a study guide studies · 讲义的经文 (ADR-0019 §2)
 *
 * The guide's text goes through the app's one reference finder
 * (studypack/verseRefs findVerseRefs + the canonical book table, R3) after
 * full-width digits, "：" and "～" are mapped to ASCII. Only "Book C:V[-V]"
 * forms count (a bare "v.7" names no passage). The most prominent reference
 * wins: a range beats a single verse, one in the title area (the first
 * TITLE_ZONE_CHARS) beats one further down, and repetition counts. The
 * result only pre-fills the form — the leader always confirms; `confident`
 * is false when nothing was found, the best is a single verse, or two
 * different passages tie.
 */
import { findVerseRefs } from '../../studypack/verseRefs';
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

function candidates(text: string): Candidate[] {
  const byKey = new Map<string, Candidate>();
  for (const ref of findVerseRefs(normaliseRefText(text))) {
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
