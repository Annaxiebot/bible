/**
 * Auto-Save Research Service
 * 
 * Handles automatic saving of AI research responses as notes.
 * Supports both verse-specific and general research categories.
 * 
 * @module autoSaveResearchService
 */

import { verseDataStorage } from './verseDataStorage';
import { ChatMessage } from '../types';
import { AIResearchEntry } from '../types/verseData';

/**
 * Configuration for auto-save behavior
 */
const AUTO_SAVE_CONFIG = {
  MAX_RESPONSE_SIZE: 50000, // 50KB limit
  DEFAULT_ENABLED: true,
  STORAGE_KEY: 'auto_save_research',
  GENERAL_BOOK_ID: 'GENERAL',
  GENERAL_CHAPTER: 0,
  DUPLICATE_CACHE_SIZE: 100, // Keep last 100 hashes to detect duplicates
} as const;

/**
 * Parameters for saving AI research
 */
export interface SaveAIResearchParams {
  message: ChatMessage;
  query: string;
  bookId?: string;
  chapter?: number;
  verses?: number[];
  tags?: string[];
  aiProvider?: 'claude' | 'gemini';
}

/**
 * Result of save operation
 */
export interface SaveResult {
  success: boolean;
  savedCount?: number;
  error?: string;
  researchIds?: string[];
}

/**
 * In-memory cache for duplicate detection
 * Stores hashes of recently saved content
 */
class DuplicateCache {
  private cache: Set<string> = new Set();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  add(hash: string): void {
    // If cache is full, remove oldest entry (first in set)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.values().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.add(hash);
  }

  has(hash: string): boolean {
    return this.cache.has(hash);
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Auto-Save Research Service
 */
class AutoSaveResearchService {
  private duplicateCache: DuplicateCache;

  constructor() {
    this.duplicateCache = new DuplicateCache(AUTO_SAVE_CONFIG.DUPLICATE_CACHE_SIZE);
  }

  /**
   * Check if auto-save is enabled
   */
  isAutoSaveEnabled(): boolean {
    const setting = localStorage.getItem(AUTO_SAVE_CONFIG.STORAGE_KEY);
    if (setting === null) {
      return AUTO_SAVE_CONFIG.DEFAULT_ENABLED;
    }
    return setting === 'true';
  }

  /**
   * Enable or disable auto-save
   */
  setAutoSaveEnabled(enabled: boolean): void {
    localStorage.setItem(AUTO_SAVE_CONFIG.STORAGE_KEY, enabled.toString());
  }

  /**
   * Parse message content to extract Chinese and English responses
   */
  private parseMessageContent(content: string): { zh: string; en: string } | { single: string } {
    if (content.includes('[SPLIT]')) {
      const parts = content.split('[SPLIT]');
      return {
        zh: parts[0]?.trim() || '',
        en: parts[1]?.trim() || '',
      };
    }
    return { single: content.trim() };
  }

  /**
   * Truncate content if it exceeds max size
   */
  private truncateContent(content: string, maxSize: number): string {
    if (content.length <= maxSize) {
      return content;
    }
    return content.substring(0, maxSize) + '\n\n[Content truncated due to size limit]';
  }

  /**
   * Generate a simple hash for duplicate detection
   */
  private generateHash(query: string, response: string, bookId: string, chapter: number): string {
    const combined = `${query}|${response.substring(0, 200)}|${bookId}|${chapter}`;
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Truncate to signed 32-bit integer to prevent float drift
    }
    return (hash >>> 0).toString(36); // Unsigned 32-bit so toString(36) is always positive
  }

  /**
   * Save AI research automatically
   * 
   * @param params - Parameters for saving
   * @returns Result indicating success/failure and saved IDs
   */
  async saveAIResearch(params: SaveAIResearchParams): Promise<SaveResult> {
    try {
      // Check if auto-save is enabled
      if (!this.isAutoSaveEnabled()) {
        return {
          success: false,
          error: 'Auto-save is disabled',
        };
      }

      const { message, query, bookId, chapter, verses, tags = [], aiProvider } = params;

      // Validate content
      const trimmedContent = message.content.trim();
      if (!trimmedContent) {
        return {
          success: false,
          error: 'Empty response content',
        };
      }

      // Determine book/chapter/verses for saving
      const targetBookId = bookId || AUTO_SAVE_CONFIG.GENERAL_BOOK_ID;
      const targetChapter = chapter ?? AUTO_SAVE_CONFIG.GENERAL_CHAPTER;
      const targetVerses = verses && verses.length > 0 ? verses : [0];

      // Parse content
      const parsed = this.parseMessageContent(trimmedContent);
      const isBilingual = 'zh' in parsed && 'en' in parsed;

      // Check for duplicates
      const hashBase = isBilingual ? parsed.zh : parsed.single;
      const contentHash = this.generateHash(query, hashBase, targetBookId, targetChapter);
      
      if (this.duplicateCache.has(contentHash)) {
        return {
          success: false,
          error: 'This research has already been saved recently',
        };
      }

      // Build base tags
      const baseTags = [...tags, 'auto-saved'];
      if (!bookId) {
        baseTags.push('general-research');
      }
      if (aiProvider) {
        baseTags.push(aiProvider);
      }

      // Build the response to save: bilingual responses are joined into one entry
      // so that one research → one note (not one Chinese + one English).
      const responseToSave = isBilingual
        ? this.truncateContent(`${parsed.zh}\n\n---\n\n${parsed.en}`, AUTO_SAVE_CONFIG.MAX_RESPONSE_SIZE)
        : this.truncateContent((parsed as { single: string }).single, AUTO_SAVE_CONFIG.MAX_RESPONSE_SIZE);

      const id = await verseDataStorage.addAIResearch(
        targetBookId,
        targetChapter,
        targetVerses,
        {
          query,
          response: responseToSave,
          tags: baseTags,
        }
      );

      const researchIds = [id];
      const savedCount = 1;

      // Add to duplicate cache
      this.duplicateCache.add(contentHash);

      return {
        success: true,
        savedCount,
        researchIds,
      };

    } catch (error) {
      console.error('[AutoSaveResearchService] Failed to save research:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Get recently auto-saved research for a specific verse
   */
  async getRecentAutoSavedResearch(
    bookId: string,
    chapter: number,
    verses: number[],
    limit: number = 10
  ): Promise<AIResearchEntry[]> {
    try {
      const verseData = await verseDataStorage.getVerseData(bookId, chapter, verses);
      
      if (!verseData || !verseData.aiResearch) {
        return [];
      }

      // Filter for auto-saved entries and sort by timestamp (newest first)
      const autoSaved = verseData.aiResearch
        .filter(r => r.tags?.includes('auto-saved'))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      return autoSaved;
    } catch (error) {
      console.error('[AutoSaveResearchService] Failed to get recent research:', error);
      return [];
    }
  }

  /**
   * Clear auto-saved research entries for a verse
   * (Keeps manually saved entries)
   */
  async clearAutoSavedResearch(
    bookId: string,
    chapter: number,
    verses: number[]
  ): Promise<void> {
    try {
      const verseData = await verseDataStorage.getVerseData(bookId, chapter, verses);
      
      if (!verseData || !verseData.aiResearch) {
        return;
      }

      // Delete only auto-saved entries
      const autoSavedIds = verseData.aiResearch
        .filter(r => r.tags?.includes('auto-saved'))
        .map(r => r.id);

      for (const id of autoSavedIds) {
        await verseDataStorage.deleteAIResearch(bookId, chapter, verses, id);
      }

      // Clear duplicate cache
      this.duplicateCache.clear();
    } catch (error) {
      console.error('[AutoSaveResearchService] Failed to clear auto-saved research:', error);
    }
  }

  /**
   * Get statistics about auto-saved research
   */
  async getAutoSaveStatistics(): Promise<{
    totalAutoSaved: number;
    byBook: Record<string, number>;
    recentCount: number; // Last 7 days
  }> {
    try {
      const allData = await verseDataStorage.getAllData();
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

      let totalAutoSaved = 0;
      let recentCount = 0;
      const byBook: Record<string, number> = {};

      for (const data of allData) {
        const autoSavedEntries = data.aiResearch.filter(r => r.tags?.includes('auto-saved'));
        const count = autoSavedEntries.length;
        
        if (count > 0) {
          totalAutoSaved += count;
          byBook[data.bookId] = (byBook[data.bookId] || 0) + count;

          // Count recent entries
          const recentEntries = autoSavedEntries.filter(r => r.timestamp > sevenDaysAgo);
          recentCount += recentEntries.length;
        }
      }

      return {
        totalAutoSaved,
        byBook,
        recentCount,
      };
    } catch (error) {
      console.error('[AutoSaveResearchService] Failed to get statistics:', error);
      return {
        totalAutoSaved: 0,
        byBook: {},
        recentCount: 0,
      };
    }
  }

  /**
   * Reset internal state. Call from test beforeEach to ensure isolation.
   * @internal
   */
  resetForTesting(): void {
    this.duplicateCache.clear();
  }
}

/**
 * Singleton instance
 */
export const autoSaveResearchService = new AutoSaveResearchService();
