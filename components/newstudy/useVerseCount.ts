/**
 * useVerseCount.ts — verse count of a bundled chapter, for the form's verse
 * dropdowns · 本章节数
 *
 * Reads 和合本 from the bundled data (services/bibleDataSource — the same
 * seam generatePack uses) and caches per book+chapter in component state.
 * `undefined` = loading, `null` = that chapter could not be loaded (offline
 * or a deployment missing the file), number = the verse count.
 */
import { useEffect, useState } from 'react';
import { fetchBundledChapter } from '../../services/bibleDataSource';
import { TRANSLATIONS } from '../studypack/principles';

export type VerseCount = number | null | undefined;

/** Largest verse count of any chapter (Psalm 119); the fallback range when the chapter cannot load. */
export const MAX_VERSES_IN_A_CHAPTER = 176;

export function chapterKey(bookId: string, chapter: number): string {
  return `${bookId}/${chapter}`;
}

export function useVerseCount(bookId: string, chapter: number): VerseCount {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const key = chapterKey(bookId, chapter);
  const known = key in counts;

  useEffect(() => {
    if (known) return;
    let live = true;
    void fetchBundledChapter(bookId, chapter, TRANSLATIONS.zh.id).then(data => {
      // A miss is an expected condition (fetchBundledChapter already returned
      // null for it); the form falls back to a wide range and generation
      // reports the bilingual "unavailable" error.
      if (live) setCounts(c => ({ ...c, [key]: data ? data.verses.length : null }));
    });
    return () => { live = false; };
  }, [bookId, chapter, key, known]);

  return known ? counts[key] : undefined;
}
