/**
 * Bible Full-Text Search Service
 *
 * Searches through Bible text stored in IndexedDB.
 * Uses chunked scanning with yielding to avoid blocking the UI.
 */

import { bibleStorage } from './bibleStorage';
import { BIBLE_BOOKS, TOTAL_CHAPTERS, OT_BOOKS, NT_BOOKS } from './bibleBookData';
import { toSimplifiedAsync } from './chineseConverter';

export interface SearchResult {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
  translation: 'cuv' | 'web';
}

export interface SearchOptions {
  query: string;
  translation?: 'cuv' | 'web' | 'both';
  testament?: 'all' | 'ot' | 'nt';
  maxResults?: number;
  onProgress?: (searched: number, total: number) => void;
  signal?: AbortSignal;
}

export interface DownloadStatus {
  downloaded: number;
  total: number;
  isComplete: boolean;
}

class BibleSearchService {
  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, translation = 'both', testament = 'all', maxResults = 200, onProgress, signal } = options;
    if (!query.trim()) return [];

    // Normalise to Simplified so Traditional text and Simplified queries both match.
    const queryNorm = (await toSimplifiedAsync(query)).toLowerCase();
    const results: SearchResult[] = [];
    const books = testament === 'ot' ? OT_BOOKS : testament === 'nt' ? NT_BOOKS : BIBLE_BOOKS;
    const translations: Array<'cuv' | 'web'> = translation === 'both' ? ['cuv', 'web'] : [translation];

    let searched = 0;
    const totalToSearch = books.reduce((sum, b) => sum + b.chapters, 0);

    for (const book of books) {
      if (signal?.aborted) break;
      if (results.length >= maxResults) break;

      for (let ch = 1; ch <= book.chapters; ch++) {
        if (signal?.aborted) break;
        if (results.length >= maxResults) break;

        for (const trans of translations) {
          try {
            const data = await bibleStorage.getChapter(book.id, ch, trans);
            if (data?.verses) {
              for (const verse of data.verses) {
                if (results.length >= maxResults) break;
                if (verse.text && (await toSimplifiedAsync(verse.text)).toLowerCase().includes(queryNorm)) {
                  results.push({
                    bookId: book.id,
                    bookName: book.name.split(' ')[0],
                    chapter: ch,
                    verse: verse.verse,
                    text: verse.text,
                    translation: trans,
                  });
                }
              }
            }
          } catch {
            // Chapter not available, skip
          }
        }

        searched++;
        if (onProgress && searched % 10 === 0) {
          onProgress(searched, totalToSearch);
          // Yield to UI thread every 10 chapters
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    if (onProgress) onProgress(totalToSearch, totalToSearch);
    return results;
  }

  async getDownloadStatus(): Promise<DownloadStatus> {
    try {
      const offlineChapters = await bibleStorage.getAllOfflineChapters();
      return {
        downloaded: offlineChapters.size,
        total: TOTAL_CHAPTERS,
        isComplete: offlineChapters.size >= TOTAL_CHAPTERS,
      };
    } catch {
      return { downloaded: 0, total: TOTAL_CHAPTERS, isComplete: false };
    }
  }
}

export const bibleSearchService = new BibleSearchService();
