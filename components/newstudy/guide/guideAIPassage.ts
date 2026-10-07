/**
 * guideAIPassage.ts — the passage the AI read in the guide · AI 读出的经文 (ADR-0019 amendment)
 *
 * The guide reply's "passage" (GUIDE_PASSAGE_FIELD) goes through the app's
 * one reference finder (findVerseRefs, after normaliseRefText) and the
 * canonical book table (the chapter exists); readAIPassage then loads it from
 * the bundled 和合本 + BSB, so its verses exist too. Anything else — missing,
 * not a reference, a chapter or verse that does not exist — is null: "not
 * found", which the caller surfaces (the leader picks the passage).
 */
import type { PackVerse } from '../../studypack/packTypes';
import { findVerseRefs } from '../../studypack/verseRefs';
import { getBookById } from '../../../services/bibleBookData';
import { GUIDE_PASSAGE_FIELD } from '../../../supabase/functions/_shared/aiPrompts';
import { loadPassage } from '../generatePack';
import type { VerseRange } from '../packAssembly';
import { normaliseRefText } from './guidePassage';
import { NS_ERR_VERSES_OUT_OF_RANGE } from '../newStudyStrings';

/** The reply's passage as a range inside one existing chapter, or null. */
export function parseGuidePassageField(raw: Record<string, unknown>): VerseRange | null {
  const value = raw[GUIDE_PASSAGE_FIELD];
  if (typeof value !== 'string') return null;
  const ref = findVerseRefs(normaliseRefText(value.trim()))[0];
  if (!ref || !ref.bookId || ref.chapter === null || ref.verses.length === 0) return null;
  const book = getBookById(ref.bookId);
  if (!book || ref.chapter < 1 || ref.chapter > book.chapters) return null;
  return { bookId: ref.bookId, chapter: ref.chapter, verseFrom: Math.min(...ref.verses), verseTo: Math.max(...ref.verses) };
}

export interface AIPassage { range: VerseRange; verses: PackVerse[] }

/** The AI's passage with its bundled verses, or null when it is unusable. A chapter that cannot be loaded at all still throws. */
export async function readAIPassage(raw: Record<string, unknown>): Promise<AIPassage | null> {
  const range = parseGuidePassageField(raw);
  if (!range) return null;
  try {
    return { range, verses: await loadPassage(range) };
  } catch (err) {
    // Verses the chapter does not have mean the AI's passage is not usable: "not found", surfaced by the caller.
    if ((err as Error).message === NS_ERR_VERSES_OUT_OF_RANGE) return null;
    throw err;
  }
}

