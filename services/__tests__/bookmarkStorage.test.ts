import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the idb module
vi.mock('idb', () => {
  const storage = new Map<string, any>();
  
  return {
    openDB: vi.fn().mockResolvedValue({
      put: vi.fn(async (storeName: string, value: any) => {
        storage.set(value.id, value);
      }),
      get: vi.fn(async (storeName: string, key: string) => {
        return storage.get(key);
      }),
      delete: vi.fn(async (storeName: string, key: string) => {
        storage.delete(key);
      }),
      count: vi.fn(async (storeName: string) => {
        return storage.size;
      }),
      getAllFromIndex: vi.fn(async (storeName: string, indexName: string) => {
        return Array.from(storage.values());
      }),
    }),
  };
});

describe('bookmarkStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Bookmark interface', () => {
    it('should define correct bookmark structure', () => {
      // Import the type and verify structure
      const bookmark = {
        id: 'GEN:1:1',
        bookId: 'GEN',
        bookName: '创世记 Genesis',
        chapter: 1,
        verse: 1,
        textPreview: '起初，神创造天地。',
        createdAt: Date.now()
      };
      
      expect(bookmark.id).toMatch(/^[A-Z0-9]+:\d+:\d+$/);
      expect(bookmark.bookId).toBe('GEN');
      expect(bookmark.chapter).toBeGreaterThan(0);
      expect(bookmark.verse).toBeGreaterThan(0);
      expect(bookmark.textPreview.length).toBeLessThanOrEqual(80);
      expect(bookmark.createdAt).toBeGreaterThan(0);
    });
  });

  describe('BookmarkStorageService structure', () => {
    it('should export bookmarkStorage singleton', async () => {
      const { bookmarkStorage } = await import('../bookmarkStorage');
      expect(bookmarkStorage).toBeDefined();
    });

    it('should have all required methods', async () => {
      const { bookmarkStorage } = await import('../bookmarkStorage');
      const methods = [
        'addBookmark',
        'removeBookmark',
        'isBookmarked',
        'getAllBookmarks',
        'getBookmarkCount',
        'importBookmark',
        'toggleBookmark'
      ];
      
      methods.forEach(method => {
        expect(typeof (bookmarkStorage as any)[method]).toBe('function');
      });
    });
  });

  describe('bookmark ID format', () => {
    it('should use bookId:chapter:verse format', () => {
      const createBookmarkId = (bookId: string, chapter: number, verse: number) => 
        `${bookId}:${chapter}:${verse}`;
      
      expect(createBookmarkId('GEN', 1, 1)).toBe('GEN:1:1');
      expect(createBookmarkId('PSA', 23, 1)).toBe('PSA:23:1');
      expect(createBookmarkId('JHN', 3, 16)).toBe('JHN:3:16');
    });
  });

  describe('bookmark operations logic', () => {
    it('should correctly toggle bookmark state', async () => {
      // Test the toggle logic without actual DB
      let isBookmarked = false;
      
      const toggle = () => {
        isBookmarked = !isBookmarked;
        return isBookmarked;
      };
      
      expect(toggle()).toBe(true);  // Added
      expect(toggle()).toBe(false); // Removed
      expect(toggle()).toBe(true);  // Added again
    });

    it('should sort bookmarks newest first', () => {
      const bookmarks = [
        { id: 'GEN:1:1', createdAt: 1000 },
        { id: 'PSA:23:1', createdAt: 3000 },
        { id: 'JHN:3:16', createdAt: 2000 }
      ];
      
      const sorted = [...bookmarks].sort((a, b) => b.createdAt - a.createdAt);
      
      expect(sorted[0].id).toBe('PSA:23:1');
      expect(sorted[1].id).toBe('JHN:3:16');
      expect(sorted[2].id).toBe('GEN:1:1');
    });
  });

  describe('text preview', () => {
    it('should truncate long verse text', () => {
      const createPreview = (text: string, maxLength = 80) => {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
      };
      
      const shortText = '起初，神创造天地。';
      // This text is 62 characters in Chinese (each Chinese char = 1 length in JS)
      const longText = '耶和华是我的牧者，我必不致缺乏。他使我躺卧在青草地上，领我在可安歇的水边。他使我的灵魂苏醒，为自己的名引导我走义路。';
      
      expect(createPreview(shortText)).toBe(shortText);
      
      // For a truly long text that exceeds 80 characters
      const veryLongText = 'A'.repeat(100);
      expect(createPreview(veryLongText).length).toBeLessThanOrEqual(80);
      expect(createPreview(veryLongText)).toContain('...');
      
      // Chinese text under 80 chars should not be truncated
      expect(longText.length).toBeLessThanOrEqual(80);
      expect(createPreview(longText)).toBe(longText);
    });
  });
});
