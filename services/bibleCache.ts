import { BIBLE_BOOKS } from '../constants';

export interface CachedChapter {
  bookId: string;
  chapter: number;
  cuvVerses: any[];
  webVerses: any[];
  timestamp: number;
}

export interface DownloadProgress {
  current: number;
  total: number;
  bookName: string;
  chapter: number;
}

const CACHE_KEY_PREFIX = 'bible_cache_';
const CACHE_INDEX_KEY = 'bible_cache_index';

export class BibleCacheService {
  // Get cached chapter from localStorage
  static getCachedChapter(bookId: string, chapter: number): CachedChapter | null {
    const key = `${CACHE_KEY_PREFIX}${bookId}_${chapter}`;
    const cached = localStorage.getItem(key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        console.error('Failed to parse cached chapter', e);
        return null;
      }
    }
    return null;
  }

  // Save chapter to localStorage
  static cacheChapter(bookId: string, chapter: number, cuvVerses: any[], webVerses: any[]) {
    const key = `${CACHE_KEY_PREFIX}${bookId}_${chapter}`;
    const data: CachedChapter = {
      bookId,
      chapter,
      cuvVerses,
      webVerses,
      timestamp: Date.now()
    };
    
    try {
      localStorage.setItem(key, JSON.stringify(data));
      this.updateCacheIndex(bookId, chapter);
    } catch (e) {
      console.error('Failed to cache chapter', e);
      // If localStorage is full, clear old cache
      if (e instanceof DOMException && e.code === 22) {
        this.clearOldCache();
        try {
          localStorage.setItem(key, JSON.stringify(data));
          this.updateCacheIndex(bookId, chapter);
        } catch (e2) {
          console.error('Still failed after clearing cache', e2);
        }
      }
    }
  }

  // Update cache index
  private static updateCacheIndex(bookId: string, chapter: number) {
    const indexStr = localStorage.getItem(CACHE_INDEX_KEY);
    let index: Record<string, number[]> = {};
    
    if (indexStr) {
      try {
        index = JSON.parse(indexStr);
      } catch (e) {
        console.error('Failed to parse cache index', e);
      }
    }
    
    if (!index[bookId]) {
      index[bookId] = [];
    }
    
    if (!index[bookId].includes(chapter)) {
      index[bookId].push(chapter);
      index[bookId].sort((a, b) => a - b);
    }
    
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  }

  // Get cache statistics
  static getCacheStats(): { totalChapters: number; cachedChapters: number; books: Record<string, number[]> } {
    const indexStr = localStorage.getItem(CACHE_INDEX_KEY);
    let index: Record<string, number[]> = {};
    
    if (indexStr) {
      try {
        index = JSON.parse(indexStr);
      } catch (e) {
        console.error('Failed to parse cache index', e);
      }
    }
    
    let totalChapters = 0;
    let cachedChapters = 0;
    
    BIBLE_BOOKS.forEach(book => {
      totalChapters += book.chapters;
      if (index[book.id]) {
        cachedChapters += index[book.id].length;
      }
    });
    
    return { totalChapters, cachedChapters, books: index };
  }

  // Clear old cache (keep recent 100 chapters)
  static clearOldCache() {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_KEY_PREFIX));
    const chapters: Array<{ key: string; timestamp: number }> = [];
    
    allKeys.forEach(key => {
      const data = localStorage.getItem(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          chapters.push({ key, timestamp: parsed.timestamp || 0 });
        } catch (e) {
          // Remove corrupted data
          localStorage.removeItem(key);
        }
      }
    });
    
    // Sort by timestamp and keep newest 100
    chapters.sort((a, b) => b.timestamp - a.timestamp);
    const toRemove = chapters.slice(100);
    
    toRemove.forEach(item => {
      localStorage.removeItem(item.key);
    });
    
    // Rebuild index
    this.rebuildCacheIndex();
  }

  // Clear all Bible cache
  static clearAllCache() {
    const allKeys = Object.keys(localStorage).filter(k => 
      k.startsWith(CACHE_KEY_PREFIX) || k === CACHE_INDEX_KEY
    );
    allKeys.forEach(key => localStorage.removeItem(key));
  }

  // Rebuild cache index from existing cached data
  private static rebuildCacheIndex() {
    const index: Record<string, number[]> = {};
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_KEY_PREFIX));
    
    allKeys.forEach(key => {
      const match = key.match(new RegExp(`^${CACHE_KEY_PREFIX}(.+)_(\\d+)$`));
      if (match) {
        const bookId = match[1];
        const chapter = parseInt(match[2]);
        if (!index[bookId]) {
          index[bookId] = [];
        }
        index[bookId].push(chapter);
      }
    });
    
    // Sort chapters
    Object.keys(index).forEach(bookId => {
      index[bookId].sort((a, b) => a - b);
    });
    
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
  }

  // Download single chapter
  static async downloadChapter(bookId: string, chapter: number): Promise<{ cuvVerses: any[]; webVerses: any[] }> {
    // Check cache first
    const cached = this.getCachedChapter(bookId, chapter);
    if (cached) {
      return { cuvVerses: cached.cuvVerses, webVerses: cached.webVerses };
    }
    
    // Fetch from API
    const [cuvRes, webRes] = await Promise.all([
      fetch(`https://bible-api.com/${bookId}${chapter}?translation=cuv`),
      fetch(`https://bible-api.com/${bookId}${chapter}?translation=web`)
    ]);
    
    const [cuvData, webData] = await Promise.all([
      cuvRes.json(),
      webRes.json()
    ]);
    
    if (!cuvData.verses || !webData.verses) {
      throw new Error(`Failed to fetch ${bookId} chapter ${chapter}`);
    }
    
    // Cache the result
    this.cacheChapter(bookId, chapter, cuvData.verses, webData.verses);
    
    return { cuvVerses: cuvData.verses, webVerses: webData.verses };
  }

  // Download entire book
  static async downloadBook(
    bookId: string, 
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    const book = BIBLE_BOOKS.find(b => b.id === bookId);
    if (!book) throw new Error('Book not found');
    
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      if (onProgress) {
        onProgress({
          current: chapter - 1,
          total: book.chapters,
          bookName: book.name,
          chapter
        });
      }
      
      await this.downloadChapter(bookId, chapter);
      
      // Add small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (onProgress) {
      onProgress({
        current: book.chapters,
        total: book.chapters,
        bookName: book.name,
        chapter: book.chapters
      });
    }
  }

  // Download entire Bible
  static async downloadWholeBible(
    onProgress?: (progress: DownloadProgress & { bookIndex: number; totalBooks: number }) => void
  ): Promise<void> {
    const totalBooks = BIBLE_BOOKS.length;
    
    for (let bookIndex = 0; bookIndex < totalBooks; bookIndex++) {
      const book = BIBLE_BOOKS[bookIndex];
      
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        if (onProgress) {
          onProgress({
            current: chapter - 1,
            total: book.chapters,
            bookName: book.name,
            chapter,
            bookIndex: bookIndex + 1,
            totalBooks
          });
        }
        
        await this.downloadChapter(book.id, chapter);
        
        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  // Export entire Bible to JSON file
  static async exportBibleToFile(): Promise<void> {
    const bibleData: any = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      books: {}
    };
    
    // Collect all cached data
    for (const book of BIBLE_BOOKS) {
      bibleData.books[book.id] = {
        name: book.name,
        chapters: {}
      };
      
      for (let chapter = 1; chapter <= book.chapters; chapter++) {
        const cached = this.getCachedChapter(book.id, chapter);
        if (cached) {
          bibleData.books[book.id].chapters[chapter] = {
            cuv: cached.cuvVerses,
            web: cached.webVerses
          };
        }
      }
    }
    
    // Create and download file
    const blob = new Blob([JSON.stringify(bibleData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bible_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import Bible from JSON file
  static async importBibleFromFile(file: File): Promise<void> {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.books) {
      throw new Error('Invalid Bible backup file');
    }
    
    // Import all chapters
    for (const bookId of Object.keys(data.books)) {
      const bookData = data.books[bookId];
      for (const chapter of Object.keys(bookData.chapters || {})) {
        const chapterData = bookData.chapters[chapter];
        if (chapterData.cuv && chapterData.web) {
          this.cacheChapter(bookId, parseInt(chapter), chapterData.cuv, chapterData.web);
        }
      }
    }
  }
}