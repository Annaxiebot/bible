/**
 * packTypes.ts — StudyPack data model for TV presentation mode · 电视演示模式
 *
 * A StudyPack is a JSON file under public/packs/<id>.json rendered as
 * full-screen slides for Friday small-group study. One section per slide,
 * except `discussion`, where each question gets its own slide.
 */

export type SectionKind =
  | 'title'
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
  'title', 'scripture', 'context', 'originalLanguage', 'crossRefs',
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
  image?: string;         // qr only — image path relative to BASE_URL (e.g. "packs/signup-qr.png")
  url?: string;           // qr only — the URL the QR encodes, printed for typers
}

/**
 * Bump when the pack JSON shape changes. The TV view appends it to the pack
 * URL so a browser never pairs a cached pack from an older deploy with newer
 * code (GitHub Pages caches JSON for 10 minutes).
 */
export const PACK_SCHEMA_VERSION = 2;

export interface StudyPack {
  id: string;
  title: string;
  date: string;        // ISO date, e.g. "2026-10-02"
  passageRef: string;  // e.g. "马太福音 6:25–34 · Matthew 6:25–34"
  enVersion: string;   // display label of the English translation, e.g. "BSB"
  sections: PackSection[];
}

/**
 * One rendered slide. Discussion sections expand to one slide per question;
 * scripture sections split into parts of at most MAX_VERSES_PER_SLIDE verses.
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
  partIndex?: number;  // scripture only — 1-based part number
  partTotal?: number;  // scripture only — total scripture parts
  headingZh?: string;
  image?: string;
  url?: string;
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

function isLifeMenuRows(value: unknown): value is LifeMenuRow[] {
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
  if (s.kind === 'qr' && (typeof s.image !== 'string' || s.image.length === 0 ||
      typeof s.url !== 'string' || s.url.length === 0)) {
    throw new Error(`StudyPack qr section ${index} needs non-empty image and url strings`);
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
  const sections = p.sections.map(parseSection);
  return { ...(p as StudyPack), sections };
}

/**
 * Most verses shown on one scripture slide. With the senior-readable type
 * scale (TYPE_SCALE.verse) four bilingual rows overflow a 16:9 1080p slide
 * — the e2e fit check proved it — so the cap is 3.
 */
export const MAX_VERSES_PER_SLIDE = 3;

/**
 * Split a passage into near-even chunks of at most MAX_VERSES_PER_SLIDE.
 * 10 verses → [3, 3, 4]: later chunks absorb the remainder.
 */
export function chunkVerses(verses: PackVerse[]): PackVerse[][] {
  const parts = Math.ceil(verses.length / MAX_VERSES_PER_SLIDE);
  const base = Math.floor(verses.length / parts);
  const extra = verses.length % parts;
  const chunks: PackVerse[][] = [];
  let start = 0;
  for (let i = 0; i < parts; i++) {
    const size = base + (i >= parts - extra ? 1 : 0);
    chunks.push(verses.slice(start, start + size));
    start += size;
  }
  return chunks;
}

/**
 * Flatten sections into slides: one per section, one per discussion question,
 * one per scripture verse chunk.
 */
export function buildSlides(pack: StudyPack): Slide[] {
  const slides: Slide[] = [];
  for (const section of pack.sections) {
    if (section.kind === 'discussion' && section.questions) {
      section.questions.forEach((question, i) => {
        slides.push({
          kind: 'discussion',
          heading: section.heading,
          question,
          questionNumber: i + 1,
          questionTotal: section.questions!.length,
        });
      });
    } else if (section.kind === 'scripture' && section.verses) {
      const chunks = chunkVerses(section.verses);
      chunks.forEach((verses, i) => {
        slides.push({
          kind: 'scripture',
          heading: section.heading,
          keyPhrase: i === 0 ? section.keyPhrase : undefined,
          verses,
          partIndex: i + 1,
          partTotal: chunks.length,
        });
      });
    } else {
      const { kind, heading, body, rows, keyPhrase, headingZh, image, url } = section;
      slides.push({ kind, heading, body, rows, keyPhrase, headingZh, image, url });
    }
  }
  return slides;
}

/** TV mode route: "#/pack/<id>" → pack id, anything else → null. */
export function getPackIdFromHash(hash: string): string | null {
  const match = /^#\/pack\/([A-Za-z0-9._-]+)$/.exec(hash);
  return match ? match[1] : null;
}
