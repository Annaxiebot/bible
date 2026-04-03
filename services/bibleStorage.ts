// Bible Storage Service using IndexedDB for large data storage
import { idbService, ChapterStorageData, ChapterRecord } from './idbService';

export type { ChapterStorageData } from './idbService';

export type BibleTranslation = 'cuv' | 'web' | 'kjv' | 'asv';

class BibleStorageService {
  /** No-op: retained for backward compatibility. DB is initialized by idbService. */
  async init(): Promise<void> {
    // DB is managed by the unified idbService singleton
  }

  async saveChapter(bookId: string, chapter: number, translation: BibleTranslation, data: ChapterStorageData): Promise<void> {
    const chapterData: ChapterRecord = {
      id: `${bookId}_${chapter}_${translation}`,
      bookId,
      chapter,
      translation,
      data
    };
    await idbService.put('bibleChapters', chapterData);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('bible-cache-updated'));
  }

  async getChapter(bookId: string, chapter: number, translation: BibleTranslation): Promise<ChapterStorageData | null> {
    const result = await idbService.get('bibleChapters', `${bookId}_${chapter}_${translation}`);
    return result ? result.data : null;
  }

  async hasChapter(bookId: string, chapter: number): Promise<boolean> {
    const cuvData = await this.getChapter(bookId, chapter, 'cuv');
    const webData = await this.getChapter(bookId, chapter, 'web');
    return !!(cuvData && webData);
  }

  async hasChapterTranslation(bookId: string, chapter: number, translation: BibleTranslation): Promise<boolean> {
    const data = await this.getChapter(bookId, chapter, translation);
    return !!data;
  }

  async getAllOfflineChapters(): Promise<Set<string>> {
    const keys = await idbService.getAllKeys('bibleChapters');
    const chapters = new Set<string>();

    // Group by bookId_chapter to check if both translations exist
    const chapterMap = new Map<string, Set<string>>();

    (keys as string[]).forEach(key => {
      const parts = key.split('_');
      if (parts.length === 3) {
        const baseKey = `${parts[0]}_${parts[1]}`;
        if (!chapterMap.has(baseKey)) {
          chapterMap.set(baseKey, new Set());
        }
        chapterMap.get(baseKey)!.add(parts[2]);
      }
    });

    // Only add to offline set if both translations exist
    chapterMap.forEach((translations, baseKey) => {
      if (translations.has('cuv') && translations.has('web')) {
        chapters.add(baseKey);
      }
    });

    return chapters;
  }

  async saveMetadata(key: string, value: string | number | boolean | object): Promise<void> {
    await idbService.put('metadata', { key, value });
  }

  async getMetadata(key: string): Promise<string | number | boolean | object | null> {
    const result = await idbService.get('metadata', key);
    return result ? result.value : null;
  }

  async deleteMetadata(key: string): Promise<void> {
    await idbService.delete('metadata', key);
  }

  async clearAll(): Promise<void> {
    await idbService.clear('bibleChapters');
    await idbService.clear('metadata');
  }

  async getStorageInfo(): Promise<{ used: number; quota: number }> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        used: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    }
    return { used: 0, quota: 0 };
  }

  // Get all stored chapters for export
  async getAllChapters(): Promise<Array<{
    bookId: string;
    chapter: number;
    translation: BibleTranslation;
    data: ChapterStorageData;
  }>> {
    const results = await idbService.getAll('bibleChapters');
    return results.map(item => ({
      bookId: item.bookId,
      chapter: item.chapter,
      translation: item.translation as BibleTranslation,
      data: item.data
    }));
  }
}

export const bibleStorage = new BibleStorageService();
