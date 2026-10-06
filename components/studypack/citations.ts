/**
 * citations.ts — check the verse references in an AI answer · 经文引用核对
 *
 * Roadmap P1 "CitationValidator": the model cites verses from memory, so a
 * reference can name a chapter or verse that does not exist. Each parsed
 * ref (verseRefs.ts) gets a verdict:
 *   valid   — every verse exists (in the pack, or in the bundled chapter);
 *   invalid — a KNOWN book with a chapter beyond the book (BIBLE_BOOKS
 *             chapter counts, synchronous) or a verse beyond the chapter;
 *   unknown — not a reference we can judge: a Book C:V shape whose book is
 *             not in BIBLE_BOOKS ("at 7:30", "下午3:00" — not scripture at
 *             all), a bare ref with no pack book/chapter, or a bundled
 *             chapter that did not load. Rendered as before, no marker.
 * Verse ranges come from the same bundled chapter files and session cache
 * as the popovers (externalVerses.ts — R3, no second loader or book list).
 * The TV "verses cited" block then shows the valid refs that point outside
 * the pack's embedded passage, with their real 和合本 + BSB text.
 */
import { StudyPack, PackVerse } from './packTypes';
import { VerseRef, findVerseRefs, packBookId, packChapter } from './verseRefs';
import { planRef, bundledVerseNumbers, loadExternalVerses } from './externalVerses';
import { bilingualRefLabel } from './refLabel';
import { BIBLE_BOOKS } from '../../services/bibleBookData';

/** At most this many cited references under a TV answer. */
export const MAX_CITED_REFS = 3;
/** At most this many verses per cited reference, then "…" (2: three bilingual refs still fit beside a long answer more often). */
export const MAX_CITED_VERSES = 2;

export type RefVerdict = 'valid' | 'invalid' | 'unknown';

/** The chapter a ref points at, when it is not fully inside the pack. */
export interface RefTarget {
  bookId: string;
  chapter: number;
}

export interface CheckedRef {
  ref: VerseRef;
  verdict: RefVerdict;
  /** Set for refs outside the pack's embedded verses; null when fully in the pack (or undecidable). */
  target: RefTarget | null;
}

type Precheck = { verdict: RefVerdict } | { verdict: 'load'; target: RefTarget };

/** Everything decidable without loading a chapter: in-pack, not-a-reference, chapter range. */
export function precheckRef(ref: VerseRef, pack: StudyPack): Precheck {
  if (planRef(ref, pack)?.verses) return { verdict: 'valid' };
  // "at 7:30", "下午3:00", "Narnia 3:1": a Book C:V shape whose book is not
  // in the canonical table is not a reference — never "no such verse".
  if (ref.chapter !== null && ref.bookId === null) return { verdict: 'unknown' };
  const bookId = ref.bookId ?? packBookId(pack);
  const chapter = ref.chapter ?? packChapter(pack);
  if (!bookId || chapter === null || ref.verses.length === 0) return { verdict: 'unknown' };
  const book = BIBLE_BOOKS.find(b => b.id === bookId);
  if (!book || chapter < 1 || chapter > book.chapters) return { verdict: 'invalid' };
  return { verdict: 'load', target: { bookId, chapter } };
}

/** One ref's verdict; verse range from the bundled chapter (和合本 ∪ BSB). */
export async function checkRef(ref: VerseRef, pack: StudyPack): Promise<CheckedRef> {
  const pre = precheckRef(ref, pack);
  if (pre.verdict !== 'load') return { ref, verdict: pre.verdict, target: null };
  const { target } = pre;
  const known = await bundledVerseNumbers(target.bookId, target.chapter);
  if (!known) return { ref, verdict: 'unknown', target };
  return { ref, verdict: ref.verses.every(v => known.has(v)) ? 'valid' : 'invalid', target };
}

/** Every reference in an answer, checked (in order of appearance). */
export function checkAnswerRefs(text: string, pack: StudyPack): Promise<CheckedRef[]> {
  return Promise.all(findVerseRefs(text).map(ref => checkRef(ref, pack)));
}

/** One entry of the TV "verses cited" block. */
export interface CitedRef {
  label: string;
  verses: PackVerse[];
  /** The ref spans more than MAX_CITED_VERSES verses ("…" follows). */
  more: boolean;
}

function refLabelIn(ref: VerseRef, pack: StudyPack): string {
  return bilingualRefLabel(ref, packBookId(pack), packChapter(pack));
}

/** Valid refs outside the pack's embedded passage, first occurrence per label, at most MAX_CITED_REFS. */
export function pickCitedRefs(checked: CheckedRef[], pack: StudyPack): Array<CheckedRef & { target: RefTarget }> {
  const seen = new Set<string>();
  const out: Array<CheckedRef & { target: RefTarget }> = [];
  for (const c of checked) {
    if (c.verdict !== 'valid' || !c.target) continue;
    const label = refLabelIn(c.ref, pack);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ ...c, target: c.target });
    if (out.length === MAX_CITED_REFS) break;
  }
  return out;
}

/**
 * The cited block's entries with their real text. The chapters are already
 * in the session cache from checking; a ref whose text still fails to load
 * is left out — the block shows only verses it can actually print, and the
 * ref's own popover surfaces the load error line.
 */
export async function loadCitedRefs(checked: CheckedRef[], pack: StudyPack): Promise<CitedRef[]> {
  const entries = await Promise.all(pickCitedRefs(checked, pack).map(async c => {
    try {
      const verses = await loadExternalVerses(c.target.bookId, c.target.chapter, c.ref.verses.slice(0, MAX_CITED_VERSES));
      return { label: refLabelIn(c.ref, pack), verses, more: c.ref.verses.length > MAX_CITED_VERSES };
    } catch {
      // Left out on purpose (see above): the popover shows VERSE_LOAD_ERROR for this ref.
      return null;
    }
  }));
  return entries.filter((e): e is CitedRef => e !== null);
}
