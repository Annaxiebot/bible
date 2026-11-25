/**
 * packTypes.ts — StudyPack data model for TV presentation mode · 电视演示模式
 *
 * A StudyPack is a JSON file under public/packs/<id>.json rendered as
 * full-screen slides for Friday small-group study. One section per slide,
 * except `discussion` (one slide per question) and sections too long for
 * one screen (continuation slides, see buildSlides).
 */

import { ContentLanguage, CONTENT_LANGUAGES, isContentLanguage, LEGACY_CONTENT_LANGUAGE } from './principles';

// Slide building lives in packSlides.ts (R4 split); re-exported so imports stay stable.
export { buildSlides, chunkVerses, MAX_VERSES_PER_SLIDE } from './packSlides';

export type SectionKind =
  | 'title'
  | 'worship'     // optional, right after the title: songs to sing before the study (ADR-0022 step 2)
  | 'sharing'     // optional, after title/worship: last week's practices + shared answers (ADR-0008)
  | 'scripture'
  | 'context'
  | 'originalLanguage'
  | 'crossRefs'
  | 'discussion'
  | 'lifeMenu'
  | 'reflection'
  | 'picture'     // optional, anywhere after the head: one illustration the leader added (ADR-0027)
  | 'qr'
  | 'closing';

const SECTION_KINDS: readonly SectionKind[] = [
  'title', 'worship', 'sharing', 'scripture', 'context', 'originalLanguage', 'crossRefs',
  'discussion', 'lifeMenu', 'reflection', 'picture', 'qr', 'closing',
];

/** One worship song: display title (Chinese first when it has one) + the YouTube link to open. */
export interface WorshipSong {
  title: string;     // e.g. "宝贵十架 Precious Cross"
  url: string;       // YouTube watch/search URL — linked, never re-hosted (ADR-0022)
  channel?: string;  // e.g. "赞美之泉 Stream of Praise"
}

/**
 * A picture section's one illustration (ADR-0027). `src` is a downscaled
 * data URL embedded in the pack (imageResize.ts) or a pasted http(s) image
 * URL; '' mid-edit (the editor starts blank; display skips it). Named
 * `picture`, not `image` — qr sections carry a LEGACY `image` string.
 */
export interface PackPicture {
  src: string;
  caption?: string;
}

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
  songs?: WorshipSong[];  // worship only — songs to sing before the study
  picture?: PackPicture;  // picture only — the leader's illustration (ADR-0027)
  headingZh?: string;     // qr only — optional Chinese heading line
  image?: string;         // qr only — legacy static image path; ignored, the QR is drawn per pack
  url?: string;           // qr only — legacy static form URL; ignored, see Slide.signupUrl
  origin?: SectionOrigin; // study-guide packs only (ADR-0019): copied from the leader's guide, or drafted by the AI
  notVerbatim?: string[]; // guide sections only: lines not word for word in the guide (flagged in the editor)
  leaderAnswer?: string[]; // guide packs only: lines that match the guide's answer bullets (flagged in the editor)
}

/** A passage inside one chapter (packAssembly's VerseRange is this type). */
export interface PassageRange { bookId: string; chapter: number; verseFrom: number; verseTo: number }

function isPassageRange(v: unknown): v is PassageRange {
  const r = v as Partial<PassageRange> | null;
  return typeof r === 'object' && r !== null && typeof r.bookId === 'string'
    && [r.chapter, r.verseFrom, r.verseTo].every(n => Number.isInteger(n));
}

/** Where a study-guide pack's section came from (ADR-0019 §5); absent on every other pack. */
export type SectionOrigin = 'guide' | 'ai';
const SECTION_ORIGINS: readonly SectionOrigin[] = ['guide', 'ai'];

// Bump on pack-shape changes; appended to the pack URL so a 10-min CDN-cached pack never meets newer code.
export const PACK_SCHEMA_VERSION = 4; // 3: worship sections (songs[]); 4: picture sections (ADR-0027)

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
  guidePassage?: PassageRange; // study-guide packs only: the passage the AI read in the guide (mismatch notice, ADR-0019)
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
  songs?: WorshipSong[]; // worship only
  picture?: PackPicture; // picture only
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

// src may be '' mid-edit (the editor starts a picture blank, like discussion's '' question); display skips it.
export function isPackPicture(value: unknown): value is PackPicture {
  const p = value as Partial<PackPicture> | null;
  return typeof p === 'object' && p !== null
    && typeof p.src === 'string'
    && (p.caption === undefined || typeof p.caption === 'string');
}

// A row's title/url may be '' mid-edit (the editor adds blank rows, like discussion's '' question); display skips them.
export function isWorshipSongs(value: unknown): value is WorshipSong[] {
  return Array.isArray(value) && value.every(v =>
    typeof v === 'object' && v !== null &&
    typeof (v as WorshipSong).title === 'string' &&
    typeof (v as WorshipSong).url === 'string' &&
    ((v as WorshipSong).channel === undefined || typeof (v as WorshipSong).channel === 'string')
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
  if (s.kind === 'worship' && (!isWorshipSongs(s.songs) || s.songs.length === 0)) {
    throw new Error(`StudyPack worship section ${index} needs non-empty songs[] ({title, url})`);
  }
  if (s.kind === 'picture' && !isPackPicture(s.picture)) {
    throw new Error(`StudyPack picture section ${index} needs a picture ({src, caption?})`);
  }
  if (s.kind === 'qr' && s.image !== undefined && typeof s.image !== 'string') {
    throw new Error(`StudyPack qr section ${index} legacy image must be a string when present`);
  }
  if (s.origin !== undefined && !SECTION_ORIGINS.includes(s.origin)) {
    throw new Error(`StudyPack section ${index} origin must be guide | ai when present`);
  }
  for (const flags of ['notVerbatim', 'leaderAnswer'] as const) {
    if (s[flags] !== undefined && !isStringArray(s[flags])) throw new Error(`StudyPack section ${index} ${flags} must be a string[] when present`);
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
  if (p.guidePassage !== undefined && !isPassageRange(p.guidePassage)) throw new Error('StudyPack guidePassage must be a passage range when present');
  const sections = p.sections.map(parseSection);
  const kept: Record<string, unknown> = { ...p };
  for (const key of LEGACY_PACK_KEYS) delete kept[key];
  return { ...(kept as unknown as StudyPack), sections };
}

/** TV mode route: "#/pack/<id>" (optionally "?<query>" after it, which is ignored) → pack id, anything else → null. */
export function getPackIdFromHash(hash: string): string | null {
  const match = /^#\/pack\/([A-Za-z0-9._-]+)(?:\?[^#]*)?$/.exec(hash);
  return match ? match[1] : null;
}
