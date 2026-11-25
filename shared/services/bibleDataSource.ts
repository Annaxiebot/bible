/**
 * bibleDataSource.ts — where chapter text comes from.
 *
 * Bundled static JSON (public/bible-data/<translation>/<bookId>/<ch>.json,
 * produced by scripts/fetch-bible-data.mjs) is tried first; bible-api.com is
 * the fallback for translations or chapters that are not bundled. Both return
 * the same shape, so the IndexedDB cache layer (bibleStorage) is unchanged.
 */
import { buildChapterUrl } from './apiConfig';
import { ChapterStorageData } from './idbService';
import { BibleTranslation } from './bibleStorage';

/** Translations shipped as static files with the app. */
export const BUNDLED_TRANSLATIONS: ReadonlySet<BibleTranslation> = new Set<BibleTranslation>([
  'cuv', 'bsb',
]);

/** Static URL for a bundled chapter, or null when that translation isn't bundled. */
export function bundledChapterUrl(
  bookId: string,
  chapter: number,
  translation: BibleTranslation,
): string | null {
  if (!BUNDLED_TRANSLATIONS.has(translation)) return null;
  return `${import.meta.env.BASE_URL}bible-data/${translation}/${bookId}/${chapter}.json`;
}

/**
 * Static URL of a chapter's cross-reference file (OpenBible.info, CC BY —
 * scripts/build-cross-refs.mjs, ADR-0015). Every chapter has one, so a miss
 * is a failed load, never "no links".
 */
export function crossRefChapterUrl(bookId: string, chapter: number): string {
  return `${import.meta.env.BASE_URL}bible-data/xref/${bookId}/${chapter}.json`;
}

/**
 * Static URLs of the original-language word data (STEP Bible, CC BY —
 * scripts/build-original-words.mjs, ADR-0018): one file per chapter (every
 * chapter has one) and one brief lexicon per language.
 */
export function originalWordsChapterUrl(bookId: string, chapter: number): string {
  return `${import.meta.env.BASE_URL}bible-data/orig/${bookId}/${chapter}.json`;
}

export function originalLexiconUrl(language: 'greek' | 'hebrew'): string {
  return `${import.meta.env.BASE_URL}bible-data/orig/lexicon-${language}.json`;
}

function hasVerses(data: unknown): data is ChapterStorageData {
  return (
    typeof data === 'object' && data !== null &&
    Array.isArray((data as ChapterStorageData).verses) &&
    (data as ChapterStorageData).verses.length > 0
  );
}

/**
 * Try the bundled static chapter. Returns null when the translation isn't
 * bundled or the file can't be fetched/parsed — the caller falls back to
 * bible-api.com, so a miss here is an expected condition, not an error.
 */
export async function fetchBundledChapter(
  bookId: string,
  chapter: number,
  translation: BibleTranslation,
): Promise<ChapterStorageData | null> {
  const url = bundledChapterUrl(bookId, chapter, translation);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return hasVerses(data) ? data : null;
  } catch {
    // Silent by design: offline with no HTTP cache, or a deployment missing
    // the static file. The caller falls back to the API / IndexedDB cache.
    return null;
  }
}

/**
 * Fetch one chapter: bundled static file first, bible-api.com as fallback.
 * Throws with context when neither source yields verses.
 */
export async function fetchChapter(
  bookId: string,
  chapter: number,
  translation: BibleTranslation,
  totalVerses?: number,
): Promise<ChapterStorageData> {
  const bundled = await fetchBundledChapter(bookId, chapter, translation);
  if (bundled) return bundled;
  const url = buildChapterUrl(bookId, chapter, translation, totalVerses);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`bible-api.com HTTP ${res.status} for ${bookId} ${chapter} (${translation})`);
  }
  const data: unknown = await res.json();
  if (!hasVerses(data)) {
    throw new Error(`bible-api.com returned no verses for ${bookId} ${chapter} (${translation})`);
  }
  return data;
}
