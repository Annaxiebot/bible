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

  describe('saveAIResearch with images', () => {
    const mockMessage: ChatMessage = {
      role: 'assistant',
      content: 'Image analysis result',
      timestamp: new Date('2026-02-27T16:00:00Z'),
    };

    it('should save research with image data', async () => {
      vi.mocked(verseDataStorage.addAIResearch).mockResolvedValue('ai_img_1');

      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: 'Describe the attached picture',
        bookId: 'genesis',
        chapter: 1,
        verses: [1],
        aiProvider: 'gemini',
        imageData: `data:image/png;base64,${base64Image}`,
        imageMimeType: 'image/png',
      });

      expect(result.success).toBe(true);
      expect(result.savedCount).toBe(1);
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'genesis',
        1,
        [1],
        expect.objectContaining({
          query: 'Describe the attached picture',
          response: 'Image analysis result',
          tags: expect.arrayContaining(['auto-saved', 'gemini']),
          image: expect.objectContaining({
            type: 'image',
            data: base64Image,
            mimeType: 'image/png',
            size: expect.any(Number),
            timestamp: expect.any(Number),
          }),
        })
      );
    });

    it('should handle image data with data URL prefix', async () => {
      vi.mocked(verseDataStorage.addAIResearch).mockResolvedValue('ai_img_2');

      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;

      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: 'What is this?',
        imageData: dataUrl,
        imageMimeType: 'image/jpeg',
      });

      expect(result.success).toBe(true);
      const call = vi.mocked(verseDataStorage.addAIResearch).mock.calls[0];
      expect(call[3].image?.data).toBe(base64Image);
      expect(call[3].image?.mimeType).toBe('image/jpeg');
    });

    it('should save research without image when no image data provided', async () => {
      vi.mocked(verseDataStorage.addAIResearch).mockResolvedValue('ai_text_1');

      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: 'Regular text query',
        bookId: 'genesis',
        chapter: 1,
        verses: [1],
      });

      expect(result.success).toBe(true);
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        'genesis',
        1,
        [1],
        expect.objectContaining({
          query: 'Regular text query',
          response: 'Image analysis result',
          image: undefined,
        })
      );
    });

    it('should calculate correct image size from base64', async () => {
      vi.mocked(verseDataStorage.addAIResearch).mockResolvedValue('ai_img_3');

      // 100 byte base64 string
      const base64Image = 'A'.repeat(100);
      
      await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: 'Test',
        imageData: base64Image,
        imageMimeType: 'image/png',
      });

      const call = vi.mocked(verseDataStorage.addAIResearch).mock.calls[0];
      // Size should be approximately (base64Length * 3) / 4
      expect(call[3].image?.size).toBeGreaterThan(0);
      expect(call[3].image?.size).toBeLessThanOrEqual(Math.ceil((100 * 3) / 4));
    });

    it('should add default question when image uploaded without text', async () => {
      vi.mocked(verseDataStorage.addAIResearch).mockResolvedValue('ai_img_4');

      const result = await autoSaveResearchService.saveAIResearch({
        message: mockMessage,
        query: '', // Empty query
        imageData: 'data:image/png;base64,abc123',
        imageMimeType: 'image/png',
      });

      expect(result.success).toBe(true);
      expect(verseDataStorage.addAIResearch).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.any(Array),
        expect.objectContaining({
          query: '', // Query should remain as passed (default is added at ChatInterface level)
        })
      );
    });
  });
});
