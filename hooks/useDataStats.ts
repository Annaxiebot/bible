import { useState, useEffect } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { bibleStorage } from '../services/bibleStorage';
import { BIBLE_BOOKS } from '../constants';

export interface NoteDetail {
  bookId: string;
  bookName: string;
  chapter: number;
  verses: number[];
  preview: string;
}

export interface ResearchDetail {
  bookId: string;
  bookName: string;
  chapter: number;
  verses: number[];
  query: string;
}

export interface ChapterDetail {
  bookId: string;
  bookName: string;
  chapterCount: number;
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
            const raw = v.personalNote.text?.replace(/<[^>]*>/g, '').trim() || '';
            noteDetails.push({
              bookId: v.bookId, bookName, chapter: v.chapter, verses: v.verses,
              preview: raw.length > 60 ? raw.slice(0, 60) + '...' : raw,
            });
          }
          for (const r of v.aiResearch) {
            researchDetails.push({
              bookId: v.bookId, bookName, chapter: v.chapter, verses: v.verses,
              query: r.query.length > 60 ? r.query.slice(0, 60) + '...' : r.query,
            });
          }
        }

        // Get cached chapters
        let cachedChapters = 0;
        const chapterDetails: ChapterDetail[] = [];
        try {
          const chapters = await bibleStorage.getAllChapters();
          const uniqueChapters = new Set(chapters.map(ch => `${ch.bookId}_${ch.chapter}`));
          cachedChapters = uniqueChapters.size;

          // Group by book
          const bookCounts: Record<string, number> = {};
          for (const key of uniqueChapters) {
            const bookId = key.split('_')[0];
            bookCounts[bookId] = (bookCounts[bookId] || 0) + 1;
          }
          for (const [bookId, count] of Object.entries(bookCounts)) {
            const book = BIBLE_BOOKS.find(b => b.id === bookId);
            chapterDetails.push({ bookId, bookName: book?.name || bookId, chapterCount: count });
          }
          // Sort by Bible order
          chapterDetails.sort((a, b) => {
            const ai = BIBLE_BOOKS.findIndex(bk => bk.id === a.bookId);
            const bi = BIBLE_BOOKS.findIndex(bk => bk.id === b.bookId);
            return ai - bi;
          });
        } catch (e) {
          console.warn('Could not get cached chapters:', e);
        }

        let totalSize;
        try {
          const storageInfo = await bibleStorage.getStorageInfo();
          if (storageInfo.used) totalSize = storageInfo.used;
        } catch (e) {
          console.warn('Could not get storage info:', e);
        }

        setStats({ personalNotes, aiResearch, cachedChapters, totalSize, noteDetails, researchDetails, chapterDetails });
      } catch (error) {
        console.error('Failed to fetch data stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [updateTrigger]);

  return { stats, loading };
}
