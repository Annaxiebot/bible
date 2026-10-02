/**
 * externalVerses.ts — resolve verse refs against the bundled Bible data.
 *
 * ADR-0003 §8: every verse reference is interactive. Refs the pack embeds
 * resolve synchronously from the pack; anything else (other book, other
 * chapter, verses outside the embedded range) loads the bundled chapter
 * JSON (public/bible-data/cuv|bsb/...) on first hover and is cached in
 * memory for the session. No third-party API is involved mid-meeting.
 */
import { StudyPack, PackVerse } from './packTypes';
import { VerseRef, packVerseIndex, packChapter, packBookId, resolveRef } from './verseRefs';
import { TRANSLATIONS } from './principles';
import { fetchBundledChapter } from '../../services/bibleDataSource';
import { ChapterStorageData } from '../../services/idbService';

const chapterCache = new Map<string, Promise<ChapterStorageData | null>>();

function cachedChapter(
  translation: typeof TRANSLATIONS.zh.id | typeof TRANSLATIONS.en.id,
  bookId: string,
  chapter: number
): Promise<ChapterStorageData | null> {
  const key = `${translation}/${bookId}/${chapter}`;
  let promise = chapterCache.get(key);
  if (!promise) {
    promise = fetchBundledChapter(bookId, chapter, translation);
    chapterCache.set(key, promise);
  }
  return promise;
}

/** Test hook: clear the session chapter cache. */
export function clearExternalVerseCache(): void {
  chapterCache.clear();
}

/**
 * Load the referenced verses from the bundled data, 和合本 + BSB combined.
 * Throws when neither translation's chapter can be loaded or no requested
 * verse exists — the tooltip shows its bilingual error line.
 */
export async function loadExternalVerses(
  bookId: string,
  chapter: number,
  verses: number[]
): Promise<PackVerse[]> {
  const [zh, en] = await Promise.all([
    cachedChapter(TRANSLATIONS.zh.id, bookId, chapter),
    cachedChapter(TRANSLATIONS.en.id, bookId, chapter),
  ]);
  if (!zh && !en) {
    throw new Error(`Bundled chapter unavailable: ${bookId} ${chapter}`);
  }
  const zhByNum = new Map((zh?.verses ?? []).map(v => [v.verse, v.text]));
  const enByNum = new Map((en?.verses ?? []).map(v => [v.verse, v.text]));
  const out: PackVerse[] = [];
  for (const num of verses) {
    const cuv = zhByNum.get(num) ?? '';
    const enText = enByNum.get(num) ?? '';
    if (cuv || enText) out.push({ num, cuv, en: enText });
  }
  if (out.length === 0) {
    throw new Error(`No bundled text for ${bookId} ${chapter}:${verses.join(',')}`);
  }
  return out;
}

/** How a matched ref should be rendered. */
export interface RefPlan {
  /** Already-resolved pack verses (render immediately). */
  verses?: PackVerse[];
  /** Lazy loader from bundled data (render on first open). */
  load?: () => Promise<PackVerse[]>;
}

/**
 * Decide how to resolve a ref: pack verses when they cover the whole ref,
 * bundled data otherwise, null when the target cannot be determined
 * (render plain).
 */
export function planRef(ref: VerseRef, pack: StudyPack): RefPlan | null {
  const inPack = resolveRef(ref, packVerseIndex(pack), packChapter(pack), packBookId(pack));
  if (inPack.length > 0 && inPack.length === ref.verses.length) {
    return { verses: inPack };
  }
  // A Book C:V match whose book name we don't recognize stays plain text —
  // guessing the pack's book for "Narnia 3:1" would show wrong scripture.
  if (ref.chapter !== null && ref.bookId === null) return null;
  const bookId = ref.bookId ?? packBookId(pack);
  const chapter = ref.chapter ?? packChapter(pack);
  if (!bookId || !chapter || ref.verses.length === 0) return null;
  return { load: () => loadExternalVerses(bookId, chapter, ref.verses) };
}
