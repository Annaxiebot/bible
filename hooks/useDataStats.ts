import { useState, useEffect } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { bibleStorage } from '../services/bibleStorage';
import { BIBLE_BOOKS } from '../constants';
import { useStorageUpdate } from './useStorageUpdate';
import { stripHTML } from '../utils/textUtils';

export interface NoteDetail {
  bookId: string;
  bookName: string;
  chapter: number;
  verses: number[];
  preview: string;
  updatedAt: number;
}

export interface ResearchDetail {
  bookId: string;
  bookName: string;
  chapter: number;
  verses: number[];
  query: string;
  timestamp: number;
}

export interface ChapterDetail {
  bookId: string;
  bookName: string;
  chapterCount: number;
  chapters: number[]; // list of cached chapter numbers
}

export interface DataStats {
  personalNotes: number;
  aiResearch: number;
  cachedChapters: number;
  totalSize?: number;
  noteDetails: NoteDetail[];
  researchDetails: ResearchDetail[];
  chapterDetails: ChapterDetail[];
}

export function useDataStats(updateTrigger?: number) {
  const storageTick = useStorageUpdate();
  const [stats, setStats] = useState<DataStats>({
    personalNotes: 0,
    aiResearch: 0,
    cachedChapters: 0,
    noteDetails: [],
    researchDetails: [],
    chapterDetails: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);

        const allVerseData = await verseDataStorage.getAllData();
        const personalNotes = allVerseData.filter(v => v.personalNote).length;
        const aiResearch = allVerseData.reduce((acc, v) => acc + v.aiResearch.length, 0);

        // Build note details
        const noteDetails: NoteDetail[] = [];
        const researchDetails: ResearchDetail[] = [];
        for (const v of allVerseData) {
          const book = BIBLE_BOOKS.find(b => b.id === v.bookId);
          const bookName = book?.name || v.bookId;
          if (v.personalNote) {
            const raw = stripHTML(v.personalNote.text ?? '').trim();
            noteDetails.push({
              bookId: v.bookId, bookName, chapter: v.chapter, verses: v.verses,
              preview: raw.length > 60 ? raw.slice(0, 60) + '...' : raw,
              updatedAt: v.personalNote.updatedAt || v.personalNote.createdAt || 0,
            });
          }
          for (const r of v.aiResearch) {
            researchDetails.push({
              bookId: v.bookId, bookName, chapter: v.chapter, verses: v.verses,
              query: r.query.length > 60 ? r.query.slice(0, 60) + '...' : r.query,
              timestamp: r.timestamp ?? 0,
            });
          }
        }
        // Sort latest first
        noteDetails.sort((a, b) => b.updatedAt - a.updatedAt);
        researchDetails.sort((a, b) => b.timestamp - a.timestamp);

        // Get cached chapters
        let cachedChapters = 0;
        const chapterDetails: ChapterDetail[] = [];
        try {
          const chapters = await bibleStorage.getAllChapters();
          const uniqueChapters = new Set(chapters.map(ch => `${ch.bookId}_${ch.chapter}`));
          cachedChapters = uniqueChapters.size;

          // Group by book, collecting chapter numbers
          const bookChapters: Record<string, number[]> = {};
          for (const key of uniqueChapters) {
            const [bookId, chStr] = key.split('_');
            if (!bookChapters[bookId]) bookChapters[bookId] = [];
            bookChapters[bookId].push(parseInt(chStr));
          }
          for (const [bookId, chs] of Object.entries(bookChapters)) {
            const book = BIBLE_BOOKS.find(b => b.id === bookId);
            chs.sort((a, b) => a - b);
            chapterDetails.push({ bookId, bookName: book?.name || bookId, chapterCount: chs.length, chapters: chs });
          }
          // Sort by Bible order
          chapterDetails.sort((a, b) => {
            const ai = BIBLE_BOOKS.findIndex(bk => bk.id === a.bookId);
            const bi = BIBLE_BOOKS.findIndex(bk => bk.id === b.bookId);
            return ai - bi;
          });
        } catch (e) {
          // silently handle
        }

        let totalSize;
        try {
          const storageInfo = await bibleStorage.getStorageInfo();
          if (storageInfo.used) totalSize = storageInfo.used;
        } catch (e) {
          // silently handle
        }

        setStats({ personalNotes, aiResearch, cachedChapters, totalSize, noteDetails, researchDetails, chapterDetails });
      } catch (error) {
        // TODO: use error reporting service
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [updateTrigger, storageTick]);

  return { stats, loading };
}
