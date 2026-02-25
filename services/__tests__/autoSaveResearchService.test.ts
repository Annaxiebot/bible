import { describe, it, expect, beforeEach, vi } from 'vitest';
import { autoSaveResearchService } from '../autoSaveResearchService';
import { verseDataStorage } from '../verseDataStorage';
import { ChatMessage } from '../../types';

// Mock verseDataStorage
vi.mock('../verseDataStorage', () => ({
  verseDataStorage: {
    addAIResearch: vi.fn(),
    getVerseData: vi.fn(),
    getAllData: vi.fn(),
    deleteAIResearch: vi.fn(),
  },
}));

// Create a proper localStorage implementation for tests
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear() {
    this.store = {};
  }

  getItem(key: string) {
    return this.store[key] || null;
  }

  setItem(key: string, value: string) {
    this.store[key] = value.toString();
  }

  removeItem(key: string) {
    delete this.store[key];
  }

  get length() {
    return Object.keys(this.store).length;
  }

  key(index: number) {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
}

describe('AutoSaveResearchService', () => {
  let localStorageMock: LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    autoSaveResearchService.resetForTesting();

    // Create fresh localStorage mock for each test
    localStorageMock = new LocalStorageMock();
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    // Default: auto-save enabled
    localStorage.setItem('auto_save_research', 'true');
  });

  describe('isAutoSaveEnabled', () => {
    it('should return true when auto-save is enabled', () => {
      localStorage.setItem('auto_save_research', 'true');
      expect(autoSaveResearchService.isAutoSaveEnabled()).toBe(true);
    });

    it('should return false when auto-save is disabled', () => {
      localStorage.setItem('auto_save_research', 'false');
      expect(autoSaveResearchService.isAutoSaveEnabled()).toBe(false);
    });

    it('should return true by default when no setting exists', () => {
      localStorage.removeItem('auto_save_research');
      expect(autoSaveResearchService.isAutoSaveEnabled()).toBe(true);
    });
  });

  describe('setAutoSaveEnabled', () => {
    it('should enable auto-save', () => {
      autoSaveResearchService.setAutoSaveEnabled(true);
      expect(localStorage.getItem('auto_save_research')).toBe('true');
    });

    it('should disable auto-save', () => {
      autoSaveResearchService.setAutoSaveEnabled(false);
      expect(localStorage.getItem('auto_save_research')).toBe('false');
    });
  });

  describe('saveAIResearch', () => {
    const mockMessage: ChatMessage = {
      role: 'assistant',
      content: '中文回答\n[SPLIT]\nEnglish response',
      timestamp: new Date('2026-02-24T23:00:00Z'),
    };

    const mockQuery = 'What does this verse mean?';

    beforeEach(() => {
      vi.mocked(verseDataStorage.addAIResearch).mockResolvedValue('ai_test_id');
    });

    it('should save AI research with verse context', async () => {
      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        bookId: 'genesis',
        chapter: 1,
        verses: [1, 2, 3],
        tags: ['faith', 'creation'],
      });

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(1); // One combined bilingual note
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledTimes(1);

      // Combined note contains both Chinese and English content
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'genesis',
        1,
        [1, 2, 3],
        expect.objectContaining({
          query: mockQuery,
          response: expect.stringContaining('中文回答'),
          tags: expect.arrayContaining(['faith', 'creation', 'auto-saved']),
        })
      );
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'genesis',
        1,
        [1, 2, 3],
        expect.objectContaining({
          response: expect.stringContaining('English response'),
        })
      );
    });

    it('should save AI research without verse context to GENERAL category', async () => {
      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        // No bookId, chapter, verses provided
      });

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(1);

      // Should save to GENERAL book, chapter 0
      const calls = vi.mocked(verseDataStorage.addAIResearch).mock.calls;
      expect(calls[0][0]).toBe('GENERAL');
      expect(calls[0][1]).toBe(0);
      expect(calls[0][2]).toEqual([0]);
      expect(calls[0][3].tags).toContain('auto-saved');
      expect(calls[0][3].tags).toContain('general-research');
    });

    it('should not save when auto-save is disabled', async () => {
      localStorage.setItem('auto_save_research', 'false');

      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        bookId: 'genesis',
        chapter: 1,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Auto-save is disabled');
      expect(verseDataStorage.addAIResearch).not.toHaveBeenCalled();
    });

    it('should handle single language response (no SPLIT)', async () => {
      const singleLangMessage: ChatMessage = {
        role: 'assistant',
        content: 'This is a single language response',
        timestamp: new Date(),
      };

      const result = await autoSaveResearchService.saveAIResearch({
        message: singleLangMessage,
        query: mockQuery,
        bookId: 'genesis',
        chapter: 1,
      });

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(1); // Only one save
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledTimes(1);
    });

    it('should include AI provider metadata in tags', async () => {
      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        bookId: 'exodus',
        chapter: 2,
        aiProvider: 'claude',
      });

      expect(result.success).toBe(true);
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Array),
        expect.objectContaining({
          tags: expect.arrayContaining(['claude']),
        })
      );
    });

    it('should handle save failures gracefully', async () => {
      vi.mocked(verseDataStorage.addAIResearch).mockRejectedValue(
        new Error('Database error')
      );

      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        bookId: 'leviticus',
        chapter: 3,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should trim and validate content before saving', async () => {
      const emptyMessage: ChatMessage = {
        role: 'assistant',
        content: '   \n\n   ',
        timestamp: new Date(),
      };

      const result = await autoSaveResearchService.saveAIResearch({
        message: emptyMessage,
        query: mockQuery,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Empty response content');
      expect(verseDataStorage.addAIResearch).not.toHaveBeenCalled();
    });

    it('should limit response size for very large responses', async () => {
      const largeContent = 'A'.repeat(100000); // 100KB
      const largeMessage: ChatMessage = {
        role: 'assistant',
        content: largeContent,
        timestamp: new Date(),
      };

      const result = await autoSaveResearchService.saveAIResearch({
        message: largeMessage,
        query: mockQuery,
        bookId: 'genesis',
        chapter: 1,
      });

      expect(result.success).toBe(true);
      
      // Check that saved content is truncated
      const savedResponse = vi.mocked(verseDataStorage.addAIResearch).mock.calls[0][3].response;
      expect(savedResponse.length).toBeLessThanOrEqual(50100); // 50KB limit + truncation message
      expect(savedResponse).toContain('[Content truncated');
    });

    it('should handle verses array being undefined', async () => {
      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        bookId: 'numbers',
        chapter: 4,
        verses: undefined,
      });

      expect(result.success).toBe(true);
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'numbers',
        4,
        [0], // Should default to [0]
        expect.any(Object)
      );
    });

    it('should prevent duplicate saves based on content hash', async () => {
      // First save
      await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        bookId: 'deuteronomy',
        chapter: 5,
        verses: [1],
      });

      vi.clearAllMocks();

      // Attempt duplicate save with identical content
      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: mockQuery,
        bookId: 'deuteronomy',
        chapter: 5,
        verses: [1],
      });

      // Should detect duplicate and skip
      expect(result.success).toBe(false);
      expect(result.error).toContain('already been saved');
      expect(verseDataStorage.addAIResearch).not.toHaveBeenCalled();
    });
  });

  describe('getRecentAutoSavedResearch', () => {
    it('should return recent auto-saved research entries', async () => {
      const mockVerseData = {
        id: 'genesis:1:1',
        bookId: 'genesis',
        chapter: 1,
        verses: [1],
        aiResearch: [
          {
            id: 'ai_1',
            query: 'Query 1',
            response: 'Response 1',
            timestamp: Date.now() - 1000,
            tags: ['auto-saved'],
          },
          {
            id: 'ai_2',
            query: 'Query 2',
            response: 'Response 2',
            timestamp: Date.now(),
            tags: ['auto-saved'],
          },
        ],
      };

      vi.mocked(verseDataStorage.getVerseData).mockResolvedValue(mockVerseData);

      const recent = await autoSaveResearchService.getRecentAutoSavedResearch('genesis', 1, [1]);

      expect(recent).toHaveLength(2);
      expect(recent[0].id).toBe('ai_2'); // Most recent first
      expect(recent[1].id).toBe('ai_1');
    });

    it('should return empty array when no auto-saved research exists', async () => {
      vi.mocked(verseDataStorage.getVerseData).mockResolvedValue(null);

      const recent = await autoSaveResearchService.getRecentAutoSavedResearch('genesis', 1, [1]);

      expect(recent).toEqual([]);
    });
  });

  describe('clearAutoSavedResearch', () => {
    it('should clear all auto-saved research for a verse', async () => {
      const mockVerseData = {
        id: 'genesis:1:1',
        bookId: 'genesis',
        chapter: 1,
        verses: [1],
        aiResearch: [
          {
            id: 'ai_1',
            query: 'Query 1',
            response: 'Response 1',
            timestamp: Date.now(),
            tags: ['auto-saved'],
          },
          {
            id: 'ai_2',
            query: 'Query 2',
            response: 'Response 2',
            timestamp: Date.now(),
            tags: ['manual'],
          },
        ],
      };

      vi.mocked(verseDataStorage.getVerseData).mockResolvedValue(mockVerseData);

      await autoSaveResearchService.clearAutoSavedResearch('genesis', 1, [1]);

      // Should only delete auto-saved entries
      expect(verseDataStorage.deleteAIResearch).toHaveBeenCalledTimes(1);
      expect(verseDataStorage.deleteAIResearch).toHaveBeenCalledWith('genesis', 1, [1], 'ai_1');
    });
  });

  describe('getAutoSaveStatistics', () => {
    it('should return statistics about auto-saved research', async () => {
      const mockData = [
        {
          id: 'genesis:1:1',
          bookId: 'genesis',
          chapter: 1,
          verses: [1],
          aiResearch: [
            {
              id: 'ai_1',
              query: 'Query 1',
              response: 'Response 1',
              timestamp: Date.now(),
              tags: ['auto-saved'],
            },
            {
              id: 'ai_2',
              query: 'Query 2',
              response: 'Response 2',
              timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days ago
              tags: ['auto-saved'],
            },
          ],
        },
        {
          id: 'exodus:1:1',
          bookId: 'exodus',
          chapter: 1,
          verses: [1],
          aiResearch: [
            {
              id: 'ai_3',
              query: 'Query 3',
              response: 'Response 3',
              timestamp: Date.now(),
              tags: ['auto-saved'],
            },
          ],
        },
      ];

      vi.mocked(verseDataStorage.getAllData).mockResolvedValue(mockData);

      const stats = await autoSaveResearchService.getAutoSaveStatistics();

      expect(stats.totalAutoSaved).toBe(3);
      expect(stats.byBook.genesis).toBe(2);
      expect(stats.byBook.exodus).toBe(1);
      expect(stats.recentCount).toBe(2); // Only last 7 days
    });
  });
});
