/**
 * Bible Text Search Utilities
 *
 * Extracted from BibleViewer.handleSearch to keep functions under 50 lines.
 */

import { bibleStorage, BibleTranslation } from './bibleStorage';
import { verseDataStorage } from './verseDataStorage';
import { toSimplified } from './chineseConverter';
import { BIBLE_BOOKS } from '../constants';

export const MAX_SEARCH_RESULTS = 50;
export const SNIPPET_MAX_LENGTH = 100;

export interface SearchResult {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  translation: string;
}

/**
 * Check if a result already exists in the results array.
 */
const isDuplicate = (
  results: SearchResult[],
  bookId: string,
  chapter: number,
  verse: number,
  translation?: string,
): boolean =>
  results.some(
    (r) =>
      r.bookId === bookId &&
      r.chapter === chapter &&
      r.verse === verse &&
      (translation === undefined || r.translation === translation),
  );

/**
 * Search cached Bible chapters for matching verses (CUV + English).
 */
export async function searchCachedChapters(
  querySimplified: string,
  queryLower: string,
  englishVersion: string,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const offlineChapterSet = await bibleStorage.getAllOfflineChapters();

  for (const chapterKey of offlineChapterSet) {
    if (results.length >= MAX_SEARCH_RESULTS) break;

    const parts = chapterKey.split('_');
    if (parts.length !== 2) continue;
    const [bookId, chapterStr] = parts;
    const chapter = parseInt(chapterStr);
    const book = BIBLE_BOOKS.find((b) => b.id === bookId);
    if (!book) continue;

    // CUV (Chinese) — normalize to simplified for matching
    const cuvData = await bibleStorage.getChapter(bookId, chapter, 'cuv');
    if (cuvData?.verses) {
      for (const verse of cuvData.verses) {
        if (results.length >= MAX_SEARCH_RESULTS) break;
        if (toSimplified(verse.text.toLowerCase()).includes(querySimplified)) {
          results.push({
            bookId,
            bookName: book.name,
            chapter,
            verse: verse.verse,
            text: verse.text,
            translation: 'CUV',
          });
        }
      }
    }

    // English
    const webData = await bibleStorage.getChapter(bookId, chapter, englishVersion as BibleTranslation);
    if (webData?.verses) {
      for (const verse of webData.verses) {
        if (results.length >= MAX_SEARCH_RESULTS) break;
        if (verse.text.toLowerCase().includes(queryLower)) {
          if (!isDuplicate(results, bookId, chapter, verse.verse)) {
            results.push({
              bookId,
              bookName: book.name,
              chapter,
              verse: verse.verse,
              text: verse.text,
              translation: 'WEB',
            });
          }
        }
      }
    }
  }

  return results;
}

/**
 * Search personal notes and AI research entries.
 */
export async function searchNotesAndResearch(
  querySimplified: string,
  existingResults: SearchResult[],
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const allVerseData = await verseDataStorage.getAllData();

  for (const vd of allVerseData) {
    if (existingResults.length + results.length >= MAX_SEARCH_RESULTS) break;
    const book = BIBLE_BOOKS.find((b) => b.id === vd.bookId);
    if (!book) continue;

    // Personal note text
    if (vd.personalNote) {
      const plainNote = vd.personalNote.text.replace(/<[^>]*>/g, '');
      if (toSimplified(plainNote.toLowerCase()).includes(querySimplified)) {
        if (!isDuplicate(existingResults, vd.bookId, vd.chapter, vd.verses[0])) {
          const snippet =
            plainNote.length > SNIPPET_MAX_LENGTH
              ? plainNote.slice(0, SNIPPET_MAX_LENGTH) + '...'
              : plainNote;
          results.push({
            bookId: vd.bookId,
            bookName: book.name,
            chapter: vd.chapter,
            verse: vd.verses[0],
            text: `📝 ${snippet}`,
            translation: '笔记 Note',
          });
        }
      }
    }

    // AI research queries and responses
    for (const research of vd.aiResearch) {
      if (existingResults.length + results.length >= MAX_SEARCH_RESULTS) break;
      const matchInQuery = toSimplified(research.query.toLowerCase()).includes(querySimplified);
      const plainResponse = research.response.replace(/<[^>]*>/g, '');
      const matchInResponse = toSimplified(plainResponse.toLowerCase()).includes(querySimplified);
      if (matchInQuery || matchInResponse) {
        if (!isDuplicate(existingResults, vd.bookId, vd.chapter, vd.verses[0], '研究 Research')) {
          const snippet = matchInQuery
            ? research.query
            : plainResponse.slice(0, SNIPPET_MAX_LENGTH) + '...';
          results.push({
            bookId: vd.bookId,
            bookName: book.name,
            chapter: vd.chapter,
            verse: vd.verses[0],
            text: `🔍 ${snippet}`,
            translation: '研究 Research',
          });
        }
      }
    }
  }

  return results;
}

/**
 * Search current chapter verses (for chapters not yet cached).
 */
export function searchCurrentChapter(
  querySimplified: string,
  queryLower: string,
  leftVerses: Array<{ verse: number; text: string }>,
  rightVerses: Array<{ verse: number; text: string }>,
  bookId: string,
  bookName: string,
  chapter: number,
  existingResults: SearchResult[],
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const verse of leftVerses) {
    if (existingResults.length + results.length >= MAX_SEARCH_RESULTS) break;
    if (toSimplified(verse.text.toLowerCase()).includes(querySimplified)) {
      results.push({
        bookId,
        bookName,
        chapter,
        verse: verse.verse,
        text: verse.text,
        translation: 'CUV',
      });
    }
  }

  for (const verse of rightVerses) {
    if (existingResults.length + results.length >= MAX_SEARCH_RESULTS) break;
    if (verse.text.toLowerCase().includes(queryLower)) {
      const allResults = [...existingResults, ...results];
      if (!isDuplicate(allResults, bookId, chapter, verse.verse)) {
        results.push({
          bookId,
          bookName,
          chapter,
          verse: verse.verse,
          text: verse.text,
          translation: 'WEB',
        });
      }
    }
  }

  return results;
}
