/**
 * generatedPack.ts — turn the model's reply into validated content · 校验
 *
 * extractJsonObject: tolerant of prose or ```json fences around the object;
 * fails (never guesses) when the object is truncated. validateGenerated:
 * every field the prompt asked for must be present with the halves the
 * content language requires (bilingual: both; zh-keywords: "zh", "en"
 * optional; en-keywords: the mirror; title and keyPhrase always both);
 * cross-references are checked against the canonical book table and invalid
 * ones dropped; the life menu must cover exactly the seven LIFE_AREAS. Any
 * failure throws a bilingual error — a half-pack is never returned.
 */
import { LIFE_AREAS, ContentLanguage } from '../studypack/principles';
import { findVerseRefs, VerseRef } from '../studypack/verseRefs';
import { getBookById } from '../../services/bibleBookData';
import {
  NS_ERR_NO_JSON, NS_ERR_INVALID, NS_ERR_NO_CROSS_REFS, NS_ERR_LIFE_AREAS,
} from './newStudyStrings';

export interface Bilingual { zh: string; en: string }
export interface CrossRef extends Bilingual { ref: VerseRef }
export interface LifeItem extends Bilingual { area: string }

export interface GeneratedContent {
  title: Bilingual;
  keyPhrase: Bilingual & { verse: number };
  context: Bilingual[];
  originalLanguage: Bilingual[];
  crossRefs: CrossRef[];
  discussion: Bilingual[];
  lifeMenu: LifeItem[];
  reflection: { tue: Bilingual; thu: Bilingual; weekend: Bilingual };
  closing: Bilingual;
}

/** First "{" … last "}" of the reply, parsed. Throws NS_ERR_NO_JSON on anything short of a complete object. */
export function extractJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error(NS_ERR_NO_JSON);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    // Rethrown with the bilingual message: a truncated/malformed object is the
    // user-facing failure here, the JSON parser's own text is not helpful.
    throw new Error(NS_ERR_NO_JSON);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(NS_ERR_NO_JSON);
  return parsed as Record<string, unknown>;
}

type Half = keyof Bilingual;
const BOTH_HALVES: readonly Half[] = ['zh', 'en'];

/** Which halves a model-drafted item must carry in a mode (title and keyPhrase always use BOTH_HALVES). */
function requiredHalves(mode: ContentLanguage): readonly Half[] {
  if (mode === 'zh-keywords') return ['zh'];
  if (mode === 'en-keywords') return ['en'];
  return BOTH_HALVES;
}

function filled(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** An object whose required halves are non-empty strings; the other half, when present, must be a string. */
function hasHalves(v: unknown, halves: readonly Half[]): v is Partial<Bilingual> {
  const b = v as Partial<Bilingual>;
  if (typeof b !== 'object' || b === null) return false;
  return BOTH_HALVES.every(h => (halves.includes(h) ? filled(b[h]) : b[h] === undefined || typeof b[h] === 'string'));
}

/** Trimmed halves; a half the mode did not ask for is '' (assembly never shows it). */
function trimHalves(b: Partial<Bilingual>): Bilingual {
  return { zh: (b.zh ?? '').trim(), en: (b.en ?? '').trim() };
}

function itemList(v: unknown, halves: readonly Half[], min: number, what: string): Bilingual[] {
  if (!Array.isArray(v) || v.length < min || !v.every(item => hasHalves(item, halves))) {
    throw new Error(`${NS_ERR_INVALID} (${what})`);
  }
  return v.map(trimHalves);
}

function one(v: unknown, halves: readonly Half[], what: string): Bilingual {
  if (!hasHalves(v, halves)) throw new Error(`${NS_ERR_INVALID} (${what})`);
  return trimHalves(v);
}

/** A "Book C:V[-V]" string → VerseRef when the book is in the canonical table and the chapter exists. */
export function parseCrossRef(ref: unknown): VerseRef | null {
  if (typeof ref !== 'string') return null;
  const found = findVerseRefs(ref.trim())[0];
  if (!found || !found.bookId || found.chapter === null || found.verses.length === 0) return null;
  const book = getBookById(found.bookId);
  if (!book || found.chapter < 1 || found.chapter > book.chapters) return null;
  return found;
}

function crossRefs(v: unknown, halves: readonly Half[]): CrossRef[] {
  if (!Array.isArray(v)) throw new Error(`${NS_ERR_INVALID} (crossRefs)`);
  const out: CrossRef[] = [];
  for (const item of v) {
    if (!hasHalves(item, halves)) continue;
    const ref = parseCrossRef((item as { ref?: unknown }).ref);
    if (ref) out.push({ ...trimHalves(item), ref });
  }
  if (out.length === 0) throw new Error(NS_ERR_NO_CROSS_REFS);
  return out;
}

/** Match a model-written area label ("健康 Health", "Health", "健康") to a canonical LIFE_AREAS entry. */
function canonicalArea(label: unknown): string | null {
  if (typeof label !== 'string') return null;
  const needle = label.trim().toLowerCase();
  for (const area of LIFE_AREAS) {
    const [zh, en] = area.split(' ');
    if (needle === area.toLowerCase() || needle === zh || needle === en.toLowerCase()) return area;
  }
  return null;
}

/** Exactly the seven areas, reordered canonically; a missing area is an error. */
function lifeMenu(v: unknown, halves: readonly Half[]): LifeItem[] {
  if (!Array.isArray(v)) throw new Error(`${NS_ERR_INVALID} (lifeMenu)`);
  const byArea = new Map<string, Bilingual>();
  for (const item of v) {
    const area = canonicalArea((item as { area?: unknown }).area);
    if (area && hasHalves(item, halves) && !byArea.has(area)) byArea.set(area, trimHalves(item));
  }
  const out: LifeItem[] = [];
  for (const area of LIFE_AREAS) {
    const practice = byArea.get(area);
    if (!practice) throw new Error(`${NS_ERR_LIFE_AREAS}: ${area}`);
    out.push({ area, ...practice });
  }
  return out;
}

function keyPhrase(v: unknown): GeneratedContent['keyPhrase'] {
  const phrase = one(v, BOTH_HALVES, 'keyPhrase');
  const verse = (v as { verse?: unknown }).verse;
  if (typeof verse !== 'number' || !Number.isInteger(verse) || verse < 1) {
    throw new Error(`${NS_ERR_INVALID} (keyPhrase.verse)`);
  }
  return { ...phrase, verse };
}

/**
 * Validate the parsed reply for the pack's content language. Throws a
 * bilingual error on the first problem; the structural checks (counts,
 * seven areas, valid references) are the same in every mode.
 */
export function validateGenerated(raw: Record<string, unknown>, mode: ContentLanguage): GeneratedContent {
  const halves = requiredHalves(mode);
  const reflection = raw.reflection as Record<string, unknown> | undefined;
  if (typeof reflection !== 'object' || reflection === null) throw new Error(`${NS_ERR_INVALID} (reflection)`);
  return {
    title: one(raw.title, BOTH_HALVES, 'title'),
    keyPhrase: keyPhrase(raw.keyPhrase),
    context: itemList(raw.context, halves, 1, 'context'),
    originalLanguage: itemList(raw.originalLanguage, halves, 1, 'originalLanguage'),
    crossRefs: crossRefs(raw.crossRefs, halves),
    discussion: itemList(raw.discussion, halves, 1, 'discussion'),
    lifeMenu: lifeMenu(raw.lifeMenu, halves),
    reflection: {
      tue: one(reflection.tue, halves, 'reflection.tue'),
      thu: one(reflection.thu, halves, 'reflection.thu'),
      weekend: one(reflection.weekend, halves, 'reflection.weekend'),
    },
    closing: one(raw.closing, halves, 'closing'),
  };
}
