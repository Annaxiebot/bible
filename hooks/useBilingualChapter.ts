import { useCallback, useEffect, useRef, useState } from 'react';
import { Verse } from '../types';
import { fetchChapter as loadChapterFromSource } from '../services/bibleDataSource';
import { bibleStorage, BibleTranslation } from '../services/bibleStorage';

export type ReaderColumn = 'chinese' | 'english';
export type ColumnStatus = 'loading' | 'ready' | 'error';

export interface ColumnState {
  /** `${bookId}:${chapter}:${translation}` the verses belong to. */
  key: string;
  status: ColumnStatus;
  verses: Verse[];
  /** Shown from the IndexedDB copy because the source could not be reached. */
  offline: boolean;
}

export interface BilingualChapterArgs {
  bookId: string;
  chapter: number;
  totalVerses?: number;
  chineseVersion: string;
  englishVersion: string;
}

export interface BilingualChapter {
  chinese: ColumnState;
  english: ColumnState;
  /** Reload one column; the other column's text is untouched. */
  retry: (column: ReaderColumn) => void;
  /** Either column is showing its cached copy after a failed fetch. */
  isOffline: boolean;
  /** Both columns are ready (fires the "chapter loaded" side effects). */
  bothSettled: boolean;
}

export const columnKey = (bookId: string, chapter: number, translation: string) =>
  `${bookId}:${chapter}:${translation}`;

// One shared empty array: a loading/failed column keeps a stable `verses` identity across renders.
const NO_VERSES: Verse[] = [];

const hasVerses = (d: { verses?: Verse[] } | null | undefined): d is { verses: Verse[] } =>
  !!d && Array.isArray(d.verses) && d.verses.length > 0;

async function readCache(bookId: string, chapter: number, t: BibleTranslation) {
  try {
    return await bibleStorage.getChapter(bookId, chapter, t);
  } catch {
    return null;
  }
}

/**
 * Load one column: cached copy first (instant, refreshed in the background),
 * else bundled data / bible-api.com, else the cache once more (offline).
 * Never throws — a failure is the 'error' state of this column only.
 */
export async function loadColumn(
  bookId: string, chapter: number, translation: BibleTranslation, totalVerses?: number,
): Promise<Omit<ColumnState, 'key'>> {
  const cached = await readCache(bookId, chapter, translation);
  if (hasVerses(cached)) {
    // Refresh the cache from the source without touching what is on screen.
    loadChapterFromSource(bookId, chapter, translation, totalVerses)
      .then(data => bibleStorage.saveChapter(bookId, chapter, translation, data))
      .catch(() => {});
    return { status: 'ready', verses: cached.verses, offline: false };
  }
  try {
    const data = await loadChapterFromSource(bookId, chapter, translation, totalVerses);
    if (!hasVerses(data)) throw new Error('no verses');
    bibleStorage.saveChapter(bookId, chapter, translation, data).catch(() => {});
    return { status: 'ready', verses: data.verses, offline: false };
  } catch {
    const again = await readCache(bookId, chapter, translation);
    if (hasVerses(again)) return { status: 'ready', verses: again.verses, offline: true };
    return { status: 'error', verses: NO_VERSES, offline: false };
  }
}

const loadingState = (key: string): ColumnState => ({ key, status: 'loading', verses: NO_VERSES, offline: false });

/**
 * The reader's two columns, loaded independently: a failing Chinese edition
 * never blanks the English text (or the reverse), each column has its own
 * retry, and a late reply for an older chapter/edition — or an older retry —
 * is dropped instead of mixing chapters.
 */
export function useBilingualChapter(args: BilingualChapterArgs): BilingualChapter {
  const { bookId, chapter, totalVerses, chineseVersion, englishVersion } = args;
  const zhKey = columnKey(bookId, chapter, chineseVersion);
  const enKey = columnKey(bookId, chapter, englishVersion);

  const [zhState, setZhState] = useState<ColumnState>(() => loadingState(zhKey));
  const [enState, setEnState] = useState<ColumnState>(() => loadingState(enKey));
  const requests = useRef<Record<ReaderColumn, number>>({ chinese: 0, english: 0 });
  const latestArgs = useRef(args);
  latestArgs.current = args;

  const run = useCallback((column: ReaderColumn) => {
    const a = latestArgs.current;
    const translation = (column === 'chinese' ? a.chineseVersion : a.englishVersion) as BibleTranslation;
    const key = columnKey(a.bookId, a.chapter, translation);
    const setState = column === 'chinese' ? setZhState : setEnState;
    const id = ++requests.current[column];
    setState(loadingState(key));
    loadColumn(a.bookId, a.chapter, translation, a.totalVerses).then(result => {
      if (requests.current[column] !== id) return; // superseded by a newer chapter, edition or retry
      setState({ key, ...result });
    });
  }, []);

  useEffect(() => { run('chinese'); }, [zhKey, run]);
  useEffect(() => { run('english'); }, [enKey, run]);
  // Unmount: drop any reply still in flight.
  useEffect(() => () => { requests.current.chinese++; requests.current.english++; }, []);

  // A state left over from the previous chapter/edition renders as loading, never as text.
  const chinese = zhState.key === zhKey ? zhState : loadingState(zhKey);
  const english = enState.key === enKey ? enState : loadingState(enKey);

  return {
    chinese,
    english,
    retry: run,
    isOffline: chinese.offline || english.offline,
    bothSettled: chinese.status !== 'loading' && english.status !== 'loading',
  };
}
