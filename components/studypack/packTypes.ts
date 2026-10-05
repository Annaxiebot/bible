/**
 * packTypes.ts — StudyPack data model for TV presentation mode · 电视演示模式
 *
 * A StudyPack is a JSON file under public/packs/<id>.json rendered as
 * full-screen slides for Friday small-group study. One section per slide,
 * except `discussion` (one slide per question) and sections too long for
 * one screen (continuation slides, see buildSlides).
 */

import { currentSignupUrl } from '../signup/signupRoute';
import { ContentLanguage, CONTENT_LANGUAGES, isContentLanguage, LEGACY_CONTENT_LANGUAGE } from './principles';
import {
  chunkBalanced, chunkBody, estimateLines, KEY_PHRASE_RESERVE_ROWS,
  MAX_LIFE_MENU_ROWS_PER_SLIDE, MAX_VERSE_ROWS_PER_SLIDE, VERSE_LINE_EMS,
} from './slideFit';
import { collapseRepeatedKindLabel } from '../../supabase/functions/send-checkins/promptText';

export type SectionKind =
  | 'title'
  | 'sharing'     // optional, right after the title: last week's practices + shared answers (ADR-0008)
  | 'scripture'
  | 'context'
  | 'originalLanguage'
  | 'crossRefs'
  | 'discussion'
  | 'lifeMenu'
  | 'reflection'
  | 'qr'
  | 'closing';

const SECTION_KINDS: readonly SectionKind[] = [
  'title', 'sharing', 'scripture', 'context', 'originalLanguage', 'crossRefs',
  'discussion', 'lifeMenu', 'reflection', 'qr', 'closing',
];

export interface LifeMenuRow {
  area: string;      // e.g. "Health 健康"
  practice: string;  // the concrete practice for the week
}

/**
 * One verse of the passage, embedded bilingually (和合本 CUV + English).
 * `en` holds the pack's English translation; which one it is lives at pack
 * level in `enVersion` (schema is stable if the translation ever changes).
 */
export interface PackVerse {
  num: number;  // verse number within the chapter
  cuv: string;  // 和合本 Chinese Union Version text, Simplified (public domain)
  en: string;   // English translation text (public domain; see StudyPack.enVersion)
}

export interface PackSection {
  kind: SectionKind;
  heading: string;        // bilingual heading, EN + 中文
  body?: string[];        // paragraphs / bullet lines
  questions?: string[];   // discussion only — one slide per question
  rows?: LifeMenuRow[];   // lifeMenu only
  keyPhrase?: string;     // scripture only — shown in large type
  verses?: PackVerse[];   // scripture only — the full embedded passage text
  headingZh?: string;     // qr only — optional Chinese heading line
  image?: string;         // qr only — legacy static image path; ignored, the QR is drawn per pack
  url?: string;           // qr only — legacy static form URL; ignored, see Slide.signupUrl
}

// Bump on pack-shape changes; appended to the pack URL so a 10-min CDN-cached pack never meets newer code.
export const PACK_SCHEMA_VERSION = 2;

/**
 * Keys an older pack may still carry from the removed Google Forms feature
 * (ADR-0004 §9, removed 2026-10-05): parsed without complaint and dropped,
 * so nothing links to a form and the next save no longer writes them.
 */
export const LEGACY_PACK_KEYS = ['feedbackFormUrl', 'feedbackFormEntries'] as const;

export interface StudyPack {
  id: string;
  title: string;
  date: string;        // ISO date, e.g. "2026-10-02"
  passageRef: string;  // e.g. "马太福音 6:25–34 · Matthew 6:25–34"
  enVersion: string;   // display label of the English translation, e.g. "BSB"
  leaderId?: string;   // Supabase auth uid of the owning leader; absent = demo pack, no sign-up
  contentLanguage?: ContentLanguage;     // how much English the generated lines carry; absent = legacy "中文 · English"
  updatedAt?: string;  // ISO time of the leader's last save (packSync newer-wins, ADR-0006); absent on older packs
  sections: PackSection[];
}

/** The pack's content language; packs written before the field existed are bilingual. */
export function packContentLanguage(pack: Pick<StudyPack, 'contentLanguage'>): ContentLanguage {
  return pack.contentLanguage ?? LEGACY_CONTENT_LANGUAGE;
}

/**
 * One rendered slide. Discussion sections expand to one slide per question;
 * scripture sections split into parts of at most MAX_VERSES_PER_SLIDE verses;
 * long body and life-menu sections continue on further slides.
 */
export interface Slide {
  kind: SectionKind;
  heading: string;
  body?: string[];
  rows?: LifeMenuRow[];
  keyPhrase?: string;
  question?: string;
  questionNumber?: number;
  questionTotal?: number;
  verses?: PackVerse[];
  partIndex?: number;  // 1-based part of a section split across slides (scripture always; others when > 1)
  partTotal?: number;  // how many slides the section was split into
  emphasis?: string;   // scripture only — the section's keyPhrase, highlighted where it occurs in the verses
  headingZh?: string;
  signupUrl?: string;  // qr only — this deployment's sign-up URL (what the QR encodes); absent on demo packs
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(v => typeof v === 'string');
}

function isPackVerses(value: unknown): value is PackVerse[] {
  return Array.isArray(value) && value.every(v =>
    typeof v === 'object' && v !== null &&
    typeof (v as PackVerse).num === 'number' &&
    typeof (v as PackVerse).cuv === 'string' && (v as PackVerse).cuv.length > 0 &&
    typeof (v as PackVerse).en === 'string' && (v as PackVerse).en.length > 0
  );
}

export function isLifeMenuRows(value: unknown): value is LifeMenuRow[] {
  return Array.isArray(value) && value.every(v =>
    typeof v === 'object' && v !== null &&
    typeof (v as LifeMenuRow).area === 'string' &&
    typeof (v as LifeMenuRow).practice === 'string'
  );
}

function parseSection(raw: unknown, index: number): PackSection {
  const s = raw as Partial<PackSection>;
  if (typeof s !== 'object' || s === null) {
    throw new Error(`StudyPack section ${index} is not an object`);
  }
  if (!SECTION_KINDS.includes(s.kind as SectionKind)) {
    throw new Error(`StudyPack section ${index} has unknown kind: ${String(s.kind)}`);
  }
  if (typeof s.heading !== 'string' || s.heading.length === 0) {
    throw new Error(`StudyPack section ${index} (${s.kind}) is missing a heading`);
  }
  if (s.kind === 'discussion' && (!isStringArray(s.questions) || s.questions.length === 0)) {
    throw new Error(`StudyPack discussion section ${index} needs a non-empty questions[]`);
  }
  if (s.kind === 'lifeMenu' && (!isLifeMenuRows(s.rows) || s.rows.length === 0)) {
    throw new Error(`StudyPack lifeMenu section ${index} needs non-empty rows[]`);
  }
  if (s.kind === 'scripture' && (!isPackVerses(s.verses) || s.verses.length === 0)) {
    throw new Error(`StudyPack scripture section ${index} needs non-empty verses[] ({num, cuv, en})`);
  }
  if (s.kind === 'sharing' && (!isStringArray(s.body) || s.body.length === 0)) {
    throw new Error(`StudyPack sharing section ${index} needs a non-empty body[]`);
  }
  if (s.kind === 'qr' && s.image !== undefined && typeof s.image !== 'string') {
    throw new Error(`StudyPack qr section ${index} legacy image must be a string when present`);
  }
  if (s.body !== undefined && !isStringArray(s.body)) {
    throw new Error(`StudyPack section ${index} (${s.kind}) body must be a string[]`);
  }
  return s as PackSection;
}

/** Validate raw JSON into a StudyPack. Throws with context on anything malformed. */
export function parseStudyPack(raw: unknown): StudyPack {
  const p = raw as Partial<StudyPack>;
  if (typeof p !== 'object' || p === null) {
    throw new Error('StudyPack JSON is not an object');
  }
  for (const field of ['id', 'title', 'date', 'passageRef', 'enVersion'] as const) {
    if (typeof p[field] !== 'string' || p[field].length === 0) {
      throw new Error(`StudyPack is missing required string field: ${field}`);
    }
  }
  if (!Array.isArray(p.sections) || p.sections.length === 0) {
    throw new Error('StudyPack needs a non-empty sections[]');
  }
  if (p.leaderId !== undefined && (typeof p.leaderId !== 'string' || p.leaderId.length === 0)) {
    throw new Error('StudyPack leaderId must be a non-empty string when present');
  }
  if (p.updatedAt !== undefined && (typeof p.updatedAt !== 'string' || Number.isNaN(Date.parse(p.updatedAt)))) {
    throw new Error('StudyPack updatedAt must be an ISO date string when present');
  }
  if (p.contentLanguage !== undefined && !isContentLanguage(p.contentLanguage)) {
    throw new Error(`StudyPack contentLanguage must be one of ${CONTENT_LANGUAGES.join(' | ')}, got: ${String(p.contentLanguage)}`);
  }
  const sections = p.sections.map(parseSection);
  const kept: Record<string, unknown> = { ...p };
  for (const key of LEGACY_PACK_KEYS) delete kept[key];
  return { ...(kept as unknown as StudyPack), sections };
}

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

/** TV mode route: "#/pack/<id>" (optionally "?<query>" after it, which is ignored) → pack id, anything else → null. */
export function getPackIdFromHash(hash: string): string | null {
  const match = /^#\/pack\/([A-Za-z0-9._-]+)(?:\?[^#]*)?$/.exec(hash);
  return match ? match[1] : null;
}
