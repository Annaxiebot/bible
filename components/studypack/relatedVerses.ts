/**
 * relatedVerses.ts — find related verses before Ask AI answers · 相关经文 (ADR-0015 §3)
 *
 * The system finds candidate verses; the model explains them. Per question:
 *   1. seeds = the pack's passage verses; verses the question names inside
 *      the passage (a selection's "第7节 / verse 7", or a typed "v.7") rank first;
 *   2. load the passage chapter's cross-reference file
 *      (public/bible-data/xref/, OpenBible.info, CC BY); each seed's links
 *      score votes ÷ that seed's top vote (its best link = 1.0), summed per
 *      target across the seeds — so one heavily-linked verse (Matthew 6:33)
 *      cannot crowd out the rest of the passage;
 *   3. drop targets inside the passage (already on screen) and overlaps;
 *   4. keep the top RELATED_VERSES_MAX, at most RELATED_PER_BOOK per book;
 *   5. load their 和合本 + BSB text with the bundled-chapter loader
 *      (externalVerses.ts — no second Bible loader).
 * A load failure never stops the answer: what loaded is used and the
 * failure is returned in `warnings` (and kept for tests in
 * lastRelatedVerses / window.__RELATED_VERSES__ in dev) — never a silent
 * empty list passed off as "no related verses" (R5, R14).
 */
import { StudyPack } from './packTypes';
import { VerseRef, findVerseRefs, packBookId, packChapter, packVerseIndex } from './verseRefs';
import { loadExternalVerses } from './externalVerses';
import { bilingualRefLabel } from './refLabel';
import { crossRefChapterUrl } from '../../services/bibleDataSource';
import { getBookIndex } from '../../services/bibleBookData';
import type { RelatedVerseText } from '../../supabase/functions/_shared/aiPrompts';

/** The switch (ADR-0015 release step 4). Off: Ask AI fetches no cross-references and sends today's request. */
export const RELATED_VERSES_ENABLED: boolean = false;
/** At most this many related references per question. */
export const RELATED_VERSES_MAX = 6;
/** At most this many from one book (variety, not one chapter of Proverbs six times). */
export const RELATED_PER_BOOK = 2;
/** A long related range prints at most this many verses (prompt size). */
export const RELATED_VERSES_PER_REF = 3;

/** One chapter's cross-reference file: verse → [[compact ref, votes], …]. */
export type XrefChapter = Record<string, Array<[string, number]>>;

export interface XrefTarget { bookId: string; chapter: number; from: number; to: number }
export interface RankedTarget extends XrefTarget {
  ref: string;
  /** Sum of the seeds' normalised scores (each seed's best link = 1.0) — the ranking key. */
  score: number;
  /** Raw OpenBible votes summed across the seeds (tie-break, and reported to the evaluation). */
  votes: number;
  focus: boolean;
  /** The passage verses that link here. */
  seeds: number[];
}
export interface PassageSpan { bookId: string; chapter: number; verses: ReadonlySet<number> }
export interface RelatedVerse extends RelatedVerseText { ref: string; votes: number }
export interface RelatedVersesResult { related: RelatedVerse[]; warnings: string[] }

const COMPACT_REF = /^([1-3A-Z]{3})\.(\d+)\.(\d+)(?:-(\d+))?$/;

/** "HEB.5.12-14" → { HEB, 5, 12, 14 }; null for anything else. */
export function parseCompactRef(ref: string): XrefTarget | null {
  const m = COMPACT_REF.exec(ref);
  if (!m) return null;
  const from = Number(m[3]);
  return { bookId: m[1], chapter: Number(m[2]), from, to: m[4] ? Number(m[4]) : from };
}

function overlaps(a: XrefTarget, b: XrefTarget): boolean {
  return a.bookId === b.bookId && a.chapter === b.chapter && a.from <= b.to && b.from <= a.to;
}

function insidePassage(t: XrefTarget, passage: PassageSpan): boolean {
  if (t.bookId !== passage.bookId || t.chapter !== passage.chapter) return false;
  for (let v = t.from; v <= t.to; v++) if (passage.verses.has(v)) return true;
  return false;
}

function compareTargets(a: RankedTarget, b: RankedTarget): number {
  return Number(b.focus) - Number(a.focus) || b.score - a.score || b.votes - a.votes ||
    getBookIndex(a.bookId) - getBookIndex(b.bookId) || a.chapter - b.chapter || a.from - b.from;
}

/**
 * Steps 2–3 for one chapter file: per-seed normalised scores (votes ÷ the
 * seed's top vote, over all its links) summed per target; passage targets dropped.
 */
function sumTargets(file: XrefChapter, passage: PassageSpan, focus: ReadonlySet<number>, malformed: string[]): RankedTarget[] {
  const byRef = new Map<string, RankedTarget>();
  for (const seed of passage.verses) {
    const links = file[String(seed)] ?? [];
    const top = Math.max(0, ...links.map(([, votes]) => votes));
    for (const [ref, votes] of links) {
      const target = parseCompactRef(ref);
      if (!target) { malformed.push(ref); continue; }
      if (insidePassage(target, passage)) continue;
      const score = top > 0 ? votes / top : 0;
      const seen = byRef.get(ref);
      if (seen) { seen.score += score; seen.votes += votes; seen.focus ||= focus.has(seed); seen.seeds.push(seed); }
      else byRef.set(ref, { ...target, ref, score, votes, focus: focus.has(seed), seeds: [seed] });
    }
  }
  return [...byRef.values()];
}

/**
 * Steps 2–4, pure: the ranked, capped targets (focus seeds' targets first,
 * then summed normalised score, raw votes, canonical order) plus any malformed refs met.
 */
export function rankRelated(
  file: XrefChapter, passage: PassageSpan, focus: ReadonlySet<number> = new Set()
): { targets: RankedTarget[]; malformed: string[] } {
  const malformed: string[] = [];
  const picked: RankedTarget[] = [];
  const perBook = new Map<string, number>();
  for (const t of sumTargets(file, passage, focus, malformed).sort(compareTargets)) {
    if (picked.length === RELATED_VERSES_MAX) break;
    if ((perBook.get(t.bookId) ?? 0) >= RELATED_PER_BOOK) continue;
    if (picked.some(p => overlaps(p, t))) continue;
    picked.push(t);
    perBook.set(t.bookId, (perBook.get(t.bookId) ?? 0) + 1);
  }
  return { targets: picked, malformed };
}

/** Passage verses the question names (bare "第7节 / v.7", or this book+chapter) — the seeds that rank first. */
export function focusVerses(question: string, passage: PassageSpan): Set<number> {
  const out = new Set<number>();
  for (const ref of findVerseRefs(question)) {
    if (ref.bookId !== null && ref.bookId !== passage.bookId) continue;
    if (ref.chapter !== null && ref.chapter !== passage.chapter) continue;
    for (const v of ref.verses) if (passage.verses.has(v)) out.add(v);
  }
  return out;
}

/** The pack's passage as book + chapter + embedded verse numbers; null when the pack does not say. */
export function packPassage(pack: StudyPack): PassageSpan | null {
  const bookId = packBookId(pack);
  const chapter = packChapter(pack);
  const verses = new Set(packVerseIndex(pack).keys());
  return bookId && chapter !== null && verses.size > 0 ? { bookId, chapter, verses } : null;
}

const xrefCache = new Map<string, Promise<XrefChapter>>();

/** Test hook: clear the session cross-reference cache. */
export function clearRelatedVersesCache(): void {
  xrefCache.clear();
}

/** One chapter's cross-reference file, cached for the session; a failed load rejects and is not cached. */
export function loadXrefChapter(bookId: string, chapter: number): Promise<XrefChapter> {
  const key = `${bookId}/${chapter}`;
  let promise = xrefCache.get(key);
  if (!promise) {
    promise = fetch(crossRefChapterUrl(bookId, chapter)).then(async res => {
      if (!res.ok) throw new Error(`cross-references ${key}: HTTP ${res.status}`);
      return await res.json() as XrefChapter;
    });
    promise.catch(() => xrefCache.delete(key)); // a later question may retry; the caller reports the failure
    xrefCache.set(key, promise);
  }
  return promise;
}

function labelOf(t: XrefTarget, verses: number[]): string {
  const ref: VerseRef = { index: 0, length: 0, text: '', bookId: t.bookId, chapter: t.chapter, verses };
  return bilingualRefLabel(ref);
}

/** Step 5: each target's 和合本 + BSB text; a failed load drops that entry with a warning. */
async function withText(targets: RankedTarget[], warnings: string[]): Promise<RelatedVerse[]> {
  const loaded = await Promise.all(targets.map(async (t): Promise<RelatedVerse | null> => {
    const nums: number[] = [];
    for (let v = t.from; v <= t.to && nums.length < RELATED_VERSES_PER_REF; v++) nums.push(v);
    try {
      const verses = await loadExternalVerses(t.bookId, t.chapter, nums);
      return { ref: t.ref, votes: t.votes, label: labelOf(t, verses.map(v => v.num)), verses };
    } catch (err) {
      warnings.push(`related verse text ${t.ref}: ${(err as Error).message}`);
      return null;
    }
  }));
  return loaded.filter((r): r is RelatedVerse => r !== null);
}

let last: RelatedVersesResult | null = null;

/** The latest result (tests and the e2e hook read it; nothing logs to the console). */
export function lastRelatedVerses(): RelatedVersesResult | null {
  return last;
}

function remember(result: RelatedVersesResult): RelatedVersesResult {
  last = result;
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as Window & { __RELATED_VERSES__?: unknown }).__RELATED_VERSES__ = result;
  return result;
}

/** Steps 1–5 for one question. Never rejects: failures come back in `warnings`. */
export async function loadRelatedVerses(pack: StudyPack, question: string): Promise<RelatedVersesResult> {
  const warnings: string[] = [];
  const passage = packPassage(pack);
  if (!passage) {
    warnings.push(`passage book/chapter unknown: ${pack.passageRef}`);
    return remember({ related: [], warnings });
  }
  let file: XrefChapter;
  try {
    file = await loadXrefChapter(passage.bookId, passage.chapter);
  } catch (err) {
    warnings.push((err as Error).message);
    return remember({ related: [], warnings });
  }
  const { targets, malformed } = rankRelated(file, passage, focusVerses(question, passage));
  if (malformed.length) warnings.push(`malformed cross-references skipped: ${malformed.join(', ')}`);
  return remember({ related: await withText(targets, warnings), warnings });
}

/**
 * ADR-0015 §5 "cited from memory": the references in an answer that point
 * at neither the study passage nor a RELATED VERSES entry (each distinct
 * reference once). A "Book C:V" shape with an unknown book is not a
 * reference (as in citations.ts) and is not counted; bare "v.N" forms
 * belong to the passage's chapter. Not hidden from the room — a correct
 * verse is still correct — but the count shows whether the rule holds.
 */
export function citedFromMemory(text: string, passage: PassageSpan, related: ReadonlyArray<{ ref: string }>): VerseRef[] {
  const spans = related.map(r => parseCompactRef(r.ref)).filter((t): t is XrefTarget => t !== null);
  const covered = (bookId: string, chapter: number, v: number) =>
    (bookId === passage.bookId && chapter === passage.chapter && passage.verses.has(v)) ||
    spans.some(s => s.bookId === bookId && s.chapter === chapter && s.from <= v && v <= s.to);
  const seen = new Set<string>();
  const out: VerseRef[] = [];
  for (const ref of findVerseRefs(text)) {
    if (ref.chapter !== null && ref.bookId === null) continue;
    const bookId = ref.bookId ?? passage.bookId;
    const chapter = ref.chapter ?? passage.chapter;
    if (ref.verses.every(v => covered(bookId, chapter, v))) continue;
    const key = `${bookId}.${chapter}.${ref.verses.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}
