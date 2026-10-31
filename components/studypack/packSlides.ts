/**
 * packSlides.ts — flatten a StudyPack's sections into TV slides · 切片
 *
 * Split out of packTypes.ts (R4): the data model stays there, the
 * slide-building logic lives here. packTypes re-exports these names so
 * existing imports keep working.
 */
import type { PackSection, PackVerse, Slide, StudyPack } from './packTypes';
import { currentSignupUrl } from '../signup/signupRoute';
import {
  chunkBalanced, chunkBody, estimateLines, KEY_PHRASE_RESERVE_ROWS,
  MAX_LIFE_MENU_ROWS_PER_SLIDE, MAX_VERSE_ROWS_PER_SLIDE, VERSE_LINE_EMS,
} from './slideFit';
import { collapseRepeatedKindLabel } from '../../supabase/functions/send-checkins/promptText';

/**
 * Most verses shown on one scripture slide, however short: three bilingual
 * rows is as much as a group reads together from one screen. Long verses
 * split sooner, by estimated rows (MAX_VERSE_ROWS_PER_SLIDE, slideFit.ts).
 */
export const MAX_VERSES_PER_SLIDE = 3;

/** A verse's height in rows: the taller of its 和合本 and English columns. */
function verseRows(verse: PackVerse): number {
  return Math.max(estimateLines(verse.cuv, VERSE_LINE_EMS), estimateLines(verse.en, VERSE_LINE_EMS));
}

/**
 * Split a passage into balanced parts that fit one slide each (10 short
 * verses → [2, 2, 3, 3]). The key phrase, shown above part 1, takes room
 * from that part.
 */
export function chunkVerses(verses: PackVerse[], keyPhrase?: string): PackVerse[][] {
  return chunkBalanced(verses, verseRows, {
    maxCost: MAX_VERSE_ROWS_PER_SLIDE,
    maxItems: MAX_VERSES_PER_SLIDE,
    firstReserve: keyPhrase ? KEY_PHRASE_RESERVE_ROWS : 0,
  });
}

/** One slide per chunk; a split section shows "· 2/3" after its heading (partIndex/partTotal). */
function partSlides<T>(chunks: T[][], make: (chunk: T[]) => Slide): Slide[] {
  return chunks.map((chunk, i) => ({
    ...make(chunk),
    ...(chunks.length > 1 ? { partIndex: i + 1, partTotal: chunks.length } : {}),
  }));
}

function sectionSlides(pack: StudyPack, section: PackSection): Slide[] {
  const { kind, heading, body, rows, headingZh } = section;
  if (kind === 'discussion' && section.questions) {
    const questions = section.questions;
    return questions.map((question, i) => ({
      kind, heading, question, questionNumber: i + 1, questionTotal: questions.length,
    }));
  }
  if (kind === 'scripture' && section.verses) {
    const chunks = chunkVerses(section.verses, section.keyPhrase);
    return chunks.map((verses, i) => ({
      kind, heading, verses, emphasis: section.keyPhrase,
      keyPhrase: i === 0 ? section.keyPhrase : undefined,
      partIndex: i + 1, partTotal: chunks.length,
    }));
  }
  if (kind === 'qr') {
    const signupUrl = pack.leaderId ? currentSignupUrl(pack.id) : undefined;
    return [{ kind, heading, body, headingZh, signupUrl }];
  }
  if (kind === 'worship' && section.songs) {
    return [{ kind, heading, body, songs: section.songs }];
  }
  if (kind === 'picture') {
    // A picture the leader never filled in (blank src mid-edit) makes no slide (ADR-0027).
    return section.picture?.src.trim() ? [{ kind, heading, picture: section.picture }] : [];
  }
  if (kind === 'lifeMenu' && rows) {
    const menuChunks = chunkBalanced(rows, () => 1, { maxCost: MAX_LIFE_MENU_ROWS_PER_SLIDE });
    return partSlides(menuChunks, chunk => ({ kind, heading, rows: chunk }));
  }
  if (body && kind !== 'title') {
    // Packs built before the assembler stripped the model's own label read "周末回顾：周末:…" — show one label.
    const lines = kind === 'reflection' ? body.map(collapseRepeatedKindLabel) : body;
    return partSlides(chunkBody(lines), chunk => ({ kind, heading, body: chunk, headingZh }));
  }
  return [{ kind, heading, body, rows, keyPhrase: section.keyPhrase, headingZh }];
}

/**
 * Flatten sections into slides: one per discussion question, one per
 * scripture verse chunk, and body / life-menu sections split into
 * continuation slides that fit the screen (slideFit.ts). The qr slide
 * carries the pack's sign-up URL (derived from its id, never stored in the
 * JSON) only when the pack has an owning leader; a demo pack gets no sign-up.
 */
export function buildSlides(pack: StudyPack): Slide[] {
  return pack.sections.flatMap(section => sectionSlides(pack, section));
}
