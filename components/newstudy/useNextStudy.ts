/**
 * useNextStudy.ts — the New-study form's suggested passage, once the packs load · 下一课建议
 *
 * null until the leader's packs have loaded, then suggestNextStudy (after the
 * latest pack, else Mark 1:1–15). Verse counts come from the bundled 和合本,
 * the same source as the form's verse dropdowns.
 */
import { useEffect, useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { TRANSLATIONS } from '../studypack/principles';
import { fetchBundledChapter } from '../../services/bibleDataSource';
import { NextStudy, suggestNextStudy, VerseCounter } from './nextStudy';

const bundledVerseCount: VerseCounter = async (bookId, chapter) => {
  const data = await fetchBundledChapter(bookId, chapter, TRANSLATIONS.zh.id);
  return data ? data.verses.length : null;
};

export function useNextStudy(packs: readonly StudyPack[], loaded: boolean): NextStudy | null {
  const [next, setNext] = useState<NextStudy | null>(null);
  useEffect(() => {
    if (!loaded) return;
    let live = true;
    void suggestNextStudy(packs, bundledVerseCount).then(s => { if (live) setNext(s); });
    return () => { live = false; };
  }, [packs, loaded]);
  return next;
}
