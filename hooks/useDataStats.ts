import { useState, useEffect } from 'react';
import { verseDataStorage } from '../services/verseDataStorage';
import { bibleStorage } from '../services/bibleStorage';
import { annotationStorage } from '../services/annotationStorage';
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

export interface AnnotationDetail {
  bookId: string;
  bookName: string;
  chapter: number;
  panelId: string;
  lastModified: number;
}

export interface DataStats {
  personalNotes: number;
  aiResearch: number;
  annotations: number;
  cachedChapters: number;
  totalSize?: number;
  noteDetails: NoteDetail[];
  researchDetails: ResearchDetail[];
  annotationDetails: AnnotationDetail[];
  chapterDetails: ChapterDetail[];
}

export function useDataStats(updateTrigger?: number) {
  const storageTick = useStorageUpdate();
  const [stats, setStats] = useState<DataStats>({
    personalNotes: 0,
    aiResearch: 0,
    annotations: 0,
    cachedChapters: 0,
    noteDetails: [],
    researchDetails: [],
    annotationDetails: [],
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

        // Get annotation details
        const annotationDetails: AnnotationDetail[] = [];
        let annotationCount = 0;
        try {
          const allAnnotations = await annotationStorage.getAllAnnotations();
          for (const ann of allAnnotations) {
            if (!ann.canvasData || ann.canvasData === '[]' || ann.canvasData === '') continue;
            const book = BIBLE_BOOKS.find(b => b.id === ann.bookId);
            if (!book) continue;
            annotationCount++;
            annotationDetails.push({
              bookId: ann.bookId,
              bookName: book.name,
              chapter: ann.chapter,
              panelId: ann.panelId || 'chinese',
              lastModified: ann.lastModified || 0,
            });
          }
          annotationDetails.sort((a, b) => b.lastModified - a.lastModified);
        } catch (e) {
          // silently handle
        }

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

        setStats({ personalNotes, aiResearch, annotations: annotationCount, cachedChapters, totalSize, noteDetails, researchDetails, annotationDetails, chapterDetails });
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
