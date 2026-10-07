/**
 * relatedSecondHop.ts — widen the pick pool by one hop · 第二跳候选经文 (ADR-0016, second attempt)
 *
 * The first evaluation showed that the verse a thematic question needs is
 * often not linked from the passage at all. For the question-aware pick
 * ONLY (the vote-ranked list — the control, and the pick's fill — never
 * changes):
 *   1. take the first SECOND_HOP_SEEDS candidates of the passage's pool;
 *   2. load their chapters' cross-reference files (relatedVerses.loadXrefChapter,
 *      the same loader and session cache) — at most SECOND_HOP_SEEDS chapters;
 *   3. each candidate's own links score as in hop 1 (votes ÷ that verse's top
 *      vote), times SECOND_HOP_WEIGHT × the candidate's hop-1 score, summed per target;
 *   4. targets inside the passage, or overlapping any hop-1 candidate, are
 *      dropped (a hop-1 candidate keeps its place and score);
 *   5. both hops merge in one rank order (hop 1's own order is kept),
 *      overlaps dropped, cut at `max` (the pick's RELATED_POOL_MAX).
 * A chapter that fails to load is skipped and reported in `warnings` (R5).
 */
import {
  PassageSpan, RankedTarget, XrefChapter, compareTargets, insidePassage, loadXrefChapter, overlaps, sumTargets,
} from './relatedVerses';

/** How many of the top hop-1 candidates lend their own links (and so how many chapter files are loaded, at most). */
export const SECOND_HOP_SEEDS = 10;
/** A hop-2 link counts this fraction of its parent's hop-1 score (a link of a link is weaker evidence). */
export const SECOND_HOP_WEIGHT = 0.5;

/** A candidate reached through another candidate's links; `via` = the hop-1 refs it came through. */
export interface SecondHopTarget extends RankedTarget { hop: 2; via: string[] }

export function isSecondHop(t: RankedTarget): t is SecondHopTarget {
  return (t as Partial<SecondHopTarget>).hop === 2;
}

export interface WidePool {
  /** Both hops in rank order, at most `max`. */
  targets: RankedTarget[];
  /** How many of `targets` came from hop 2. */
  hop2: number;
  /** Chapter files asked for (distinct). */
  chapters: number;
  warnings: string[];
}

export type XrefLoader = (bookId: string, chapter: number) => Promise<XrefChapter>;

const chapterKey = (t: { bookId: string; chapter: number }) => `${t.bookId}/${t.chapter}`;

function spanOf(t: RankedTarget): PassageSpan {
  const verses = new Set<number>();
  for (let v = t.from; v <= t.to; v++) verses.add(v);
  return { bookId: t.bookId, chapter: t.chapter, verses };
}

/** Steps 3–4, pure: the hop-2 targets of `parents` whose chapter file is in `files`. */
export function secondHopTargets(
  parents: readonly RankedTarget[], files: ReadonlyMap<string, XrefChapter>,
  hop1: readonly RankedTarget[], passage: PassageSpan, malformed: string[],
): SecondHopTarget[] {
  const byRef = new Map<string, SecondHopTarget>();
  for (const parent of parents) {
    const file = files.get(chapterKey(parent));
    if (!file) continue;
    for (const t of sumTargets(file, spanOf(parent), new Set(), malformed)) {
      if (insidePassage(t, passage) || hop1.some(h => overlaps(h, t))) continue;
      const score = SECOND_HOP_WEIGHT * parent.score * t.score;
      const seen = byRef.get(t.ref);
      if (seen) { seen.score += score; seen.votes += t.votes; seen.via.push(parent.ref); }
      else byRef.set(t.ref, { ...t, score, focus: false, seeds: [], hop: 2, via: [parent.ref] });
    }
  }
  return [...byRef.values()];
}

/** Step 5, pure: one rank order, overlaps dropped, at most `max`. */
export function mergePools(hop1: readonly RankedTarget[], hop2: readonly RankedTarget[], max: number): RankedTarget[] {
  const out: RankedTarget[] = [];
  for (const t of [...hop1, ...hop2].sort(compareTargets)) {
    if (out.length === max) break;
    if (!out.some(p => overlaps(p, t))) out.push(t);
  }
  return out;
}

/** Steps 1–5. Never rejects: a chapter that fails to load is skipped and named in `warnings`. */
export async function widenPool(
  pool: readonly RankedTarget[], passage: PassageSpan, max: number, load: XrefLoader = loadXrefChapter,
): Promise<WidePool> {
  const parents = pool.slice(0, SECOND_HOP_SEEDS);
  const keys = [...new Set(parents.map(chapterKey))];
  const loaded = await Promise.all(keys.map(async key => {
    const [bookId, chapter] = key.split('/');
    try {
      return { key, file: await load(bookId, Number(chapter)) };
    } catch (err) {
      return { key, error: err instanceof Error ? err.message : String(err) };
    }
  }));
  const warnings: string[] = [];
  const files = new Map<string, XrefChapter>();
  for (const r of loaded) {
    if ('file' in r && r.file) files.set(r.key, r.file);
    else warnings.push(`second hop skipped ${r.key}: ${'error' in r ? r.error : 'no file'}`);
  }
  const malformed: string[] = [];
  const hop2 = secondHopTargets(parents, files, pool, passage, malformed);
  if (malformed.length) warnings.push(`second hop: malformed cross-references skipped: ${malformed.join(', ')}`);
  const targets = mergePools(pool, hop2, max);
  return { targets, hop2: targets.filter(isSecondHop).length, chapters: keys.length, warnings };
}
