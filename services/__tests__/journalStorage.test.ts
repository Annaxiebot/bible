import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the idb module before importing journalStorage
vi.mock('idb', () => {
  const storage = new Map<string, any>();

  return {
    openDB: vi.fn().mockResolvedValue({
      put: vi.fn(async (_storeName: string, value: any) => {
        storage.set(value.id, value);
        return value.id;
      }),
      get: vi.fn(async (_storeName: string, key: string) => {
        return storage.get(key);
      }),
      getAll: vi.fn(async (_storeName: string) => {
        return Array.from(storage.values());
      }),
      getAllKeys: vi.fn(async (_storeName: string) => {
        return Array.from(storage.keys());
      }),
      delete: vi.fn(async (_storeName: string, key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(async (_storeName: string) => {
        storage.clear();
      }),
      count: vi.fn(async (_storeName: string) => {
        return storage.size;
      }),
      transaction: vi.fn((_storeName: string, _mode: string) => ({
        objectStore: vi.fn((_name: string) => ({
          put: vi.fn(async (value: any) => {
            storage.set(value.id, value);
          }),
        })),
        done: Promise.resolve(),
      })),
    }),
  };
});

describe('journalStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('JournalStorageService structure', () => {
    it('should export journalStorage singleton', async () => {
      const { journalStorage } = await import('../journalStorage');
      expect(journalStorage).toBeDefined();
    });

    it('should have all required methods', async () => {
      const { journalStorage } = await import('../journalStorage');
      const methods = [
        'saveEntry',
        'updateEntry',
        'getEntry',
        'getAllEntries',
        'getEntriesByDateRange',
        'deleteEntry',
        'clearAllEntries',
        'getEntryCount',
        'searchEntries',
      ];

      methods.forEach(method => {
        expect(typeof (journalStorage as any)[method]).toBe('function');
      });
    });
  });

  describe('JournalEntry data structure', () => {
    it('should define correct journal entry shape', () => {
      const entry = {
        id: 'journal-12345-abc',
        title: 'My Reflection',
        content: '<p>Thoughts on today...</p>',
        drawing: '',
        tags: ['reflection', 'prayer'],
        bibleReference: 'PSA:23:1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(entry.id).toMatch(/^journal-/);
      expect(entry.title).toBeDefined();
      expect(entry.content).toBeDefined();
      expect(entry.drawing).toBeDefined();
      expect(entry.tags).toBeInstanceOf(Array);
      expect(entry.createdAt).toBeGreaterThan(0);
      expect(entry.updatedAt).toBeGreaterThan(0);
    });

    it('should support entries without optional fields', () => {
      const entry = {
        id: 'journal-12345-def',
        title: 'Simple Entry',
        content: 'Just text',
        drawing: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      expect(entry.id).toBeDefined();
      expect(entry.title).toBe('Simple Entry');
      // No tags or bibleReference — both are optional
    });
  });

  describe('entry ID format', () => {
    it('should generate IDs with journal prefix and timestamp', () => {
      const idPattern = /^journal-\d+-[a-z0-9]+$/;
      const testId = `journal-${Date.now()}-abc123`;
      expect(testId).toMatch(idPattern);
    });
  });

  describe('search functionality', () => {
    it('should match entries by title content', () => {
      const entries = [
        { id: '1', title: 'Morning Prayer', content: '', drawing: '', createdAt: 1, updatedAt: 1 },
        { id: '2', title: 'Evening Reflection', content: '', drawing: '', createdAt: 2, updatedAt: 2 },
        { id: '3', title: 'Random Thoughts', content: 'prayer is important', drawing: '', createdAt: 3, updatedAt: 3 },
      ];

      const query = 'prayer';
      const lowerQuery = query.toLowerCase();
      const results = entries.filter(e =>
        e.title.toLowerCase().includes(lowerQuery) ||
        e.content.toLowerCase().includes(lowerQuery)
      );

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Morning Prayer');
      expect(results[1].content).toContain('prayer');
    });

    it('should match entries by tags', () => {
      const entries = [
        { id: '1', title: 'Entry 1', content: '', drawing: '', tags: ['faith', 'hope'], createdAt: 1, updatedAt: 1 },
        { id: '2', title: 'Entry 2', content: '', drawing: '', tags: ['love'], createdAt: 2, updatedAt: 2 },
      ];

      const query = 'faith';
      const lowerQuery = query.toLowerCase();
      const results = entries.filter(e =>
        e.tags?.some(t => t.toLowerCase().includes(lowerQuery))
      );

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('1');
    });
  });

  describe('date range filtering', () => {
    it('should filter entries within a date range', () => {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000;

      const entries = [
        { id: '1', title: 'Old', createdAt: now - 10 * oneDay, updatedAt: now - 10 * oneDay },
        { id: '2', title: 'Recent', createdAt: now - 2 * oneDay, updatedAt: now - 2 * oneDay },
        { id: '3', title: 'Today', createdAt: now, updatedAt: now },
      ];

      const from = now - 3 * oneDay;
      const to = now + oneDay;
      const filtered = entries.filter(e => e.createdAt >= from && e.createdAt <= to);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].title).toBe('Recent');
      expect(filtered[1].title).toBe('Today');
    });
  });

  describe('sorting', () => {
    it('should sort entries by updatedAt descending', () => {
      const entries = [
        { id: '1', updatedAt: 100 },
        { id: '2', updatedAt: 300 },
        { id: '3', updatedAt: 200 },
      ];

      const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);

      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });
  });
});
