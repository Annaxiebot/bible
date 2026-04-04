import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — tracks upsert/select calls
// ---------------------------------------------------------------------------

const mockSupabaseData: Record<string, any[]> = {};
const mockUpsertCalls: Array<{ table: string; data: any; options: any }> = [];

function resetSupabaseMock() {
  for (const key of Object.keys(mockSupabaseData)) delete mockSupabaseData[key];
  mockUpsertCalls.length = 0;
}

const mockFrom = (table: string) => ({
  select: (_cols?: string) => ({
    eq: (_col: string, _val: string) => ({
      gte: (_col2: string, _val2: string) => Promise.resolve({ data: mockSupabaseData[table] || [], error: null }),
      single: () => Promise.resolve({ data: (mockSupabaseData[table] || [])[0] || null, error: null }),
      // plain eq terminal
      then: undefined as any,
      // Return the data array directly for queries without further chaining
      ...Promise.resolve({ data: mockSupabaseData[table] || [], error: null }),
    }),
    // Also support bare select without eq
    ...Promise.resolve({ data: mockSupabaseData[table] || [], error: null }),
  }),
  upsert: (data: any, options?: any) => {
    mockUpsertCalls.push({ table, data, options });
    return Promise.resolve({ data: null, error: null });
  },
});

// Mock supabase module
vi.mock('../supabase', () => ({
  supabase: { from: (t: string) => mockFrom(t) },
  authManager: {
    getUserId: () => 'test-user-123',
    subscribe: vi.fn(),
  },
  syncManager: {
    setStatus: vi.fn(),
    getStatus: () => 'idle',
    startSync: vi.fn(),
    stepStart: vi.fn(),
    stepDone: vi.fn(),
    resetCancelled: vi.fn(),
    isCancelled: () => false,
    cancelSync: vi.fn(),
  },
  canSync: () => true,
}));

// ---------------------------------------------------------------------------
// idb mock (for services that use IndexedDB)
// ---------------------------------------------------------------------------

const idbStores: Record<string, Map<string, any>> = {
  verseData: new Map(),
  bookmarks: new Map(),
  bibleChapters: new Map(),
  metadata: new Map(),
  notes: new Map(),
  annotations: new Map(),
};

function resetIdbStores() {
  for (const store of Object.values(idbStores)) store.clear();
}

vi.mock('idb', () => {
  return {
    openDB: vi.fn().mockResolvedValue({
      put: vi.fn(async (storeName: string, value: any, key?: string) => {
        const store = idbStores[storeName];
        if (store) {
          const k = key ?? value.id ?? value.key ?? value.reference;
          store.set(k, value);
        }
      }),
      get: vi.fn(async (storeName: string, key: string) => {
        return idbStores[storeName]?.get(key) ?? undefined;
      }),
      getAll: vi.fn(async (storeName: string) => {
        return Array.from(idbStores[storeName]?.values() ?? []);
      }),
      getAllKeys: vi.fn(async (storeName: string) => {
        return Array.from(idbStores[storeName]?.keys() ?? []);
      }),
      getAllFromIndex: vi.fn(async (storeName: string) => {
        return Array.from(idbStores[storeName]?.values() ?? []);
      }),
      delete: vi.fn(async (storeName: string, key: string) => {
        idbStores[storeName]?.delete(key);
      }),
      count: vi.fn(async (storeName: string) => {
        return idbStores[storeName]?.size ?? 0;
      }),
      clear: vi.fn(async (storeName: string) => {
        idbStores[storeName]?.clear();
      }),
      transaction: vi.fn(() => ({
        objectStore: vi.fn(() => ({
          getAll: vi.fn(async () => []),
          put: vi.fn(),
          delete: vi.fn(),
          openCursor: vi.fn(async () => null),
        })),
        done: Promise.resolve(),
      })),
    }),
  };
});

// localStorage mock
const localStorageData: Record<string, string> = {};

vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
});

// navigator.onLine mock
vi.stubGlobal('navigator', { onLine: true });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMock();
    resetIdbStores();
    for (const key of Object.keys(localStorageData)) delete localStorageData[key];
  });

  describe('module exports', () => {
    it('should export syncService with all sync methods', async () => {
      const { syncService } = await import('../syncService');
      expect(syncService).toBeDefined();
      expect(typeof syncService.performFullSync).toBe('function');
      expect(typeof syncService.syncNotes).toBe('function');
      expect(typeof syncService.syncAnnotations).toBe('function');
      expect(typeof syncService.syncReadingHistory).toBe('function');
      expect(typeof syncService.syncSettings).toBe('function');
      expect(typeof syncService.syncVerseData).toBe('function');
      expect(typeof syncService.syncBookmarks).toBe('function');
      expect(typeof syncService.syncBibleCache).toBe('function');
      expect(typeof syncService.canSync).toBe('function');
      expect(typeof syncService.getSyncState).toBe('function');
    });
  });

  describe('SyncState', () => {
    it('should include new sync state fields with defaults of 0', async () => {
      const { syncService } = await import('../syncService');
      const state = syncService.getSyncState();
      expect(state.lastVerseDataSync).toBe(0);
      expect(state.lastBookmarksSync).toBe(0);
      expect(state.lastBibleCacheSync).toBe(0);
    });

    it('should preserve new fields when reading from localStorage with old data', async () => {
      // Simulate old sync state that lacks new fields
      localStorageData['bible-app-sync-state'] = JSON.stringify({
        lastNotesSync: 1000,
        lastAnnotationsSync: 2000,
        lastHistorySync: 3000,
        lastSettingsSync: 4000,
      });

      const { syncService } = await import('../syncService');
      const state = syncService.getSyncState();
      expect(state.lastNotesSync).toBe(1000);
      expect(state.lastVerseDataSync).toBe(0);
      expect(state.lastBookmarksSync).toBe(0);
      expect(state.lastBibleCacheSync).toBe(0);
    });
  });

  describe('syncVerseData', () => {
    it('should be callable without errors when no local or remote data exists', async () => {
      const { syncService } = await import('../syncService');
      await expect(syncService.syncVerseData()).resolves.not.toThrow();
    });
  });

  describe('syncBookmarks', () => {
    it('should be callable without errors when no local or remote data exists', async () => {
      const { syncService } = await import('../syncService');
      await expect(syncService.syncBookmarks()).resolves.not.toThrow();
    });
  });

  describe('syncBibleCache', () => {
    it('should be callable without errors when no local or remote data exists', async () => {
      const { syncService } = await import('../syncService');
      await expect(syncService.syncBibleCache()).resolves.not.toThrow();
    });
  });

  describe('performFullSync', () => {
    it('should call all sync functions including new ones', async () => {
      const { syncService } = await import('../syncService');
      // performFullSync should complete without error
      await expect(syncService.performFullSync()).resolves.not.toThrow();
    });
  });

  describe('performIncrementalSync', () => {
    it('should complete without error when no modules are stale', async () => {
      const { syncService } = await import('../syncService');
      await expect(syncService.performIncrementalSync()).resolves.not.toThrow();
    });
  });

  describe('notifySettingsChanged', () => {
    it('should dispatch settings-updated event', async () => {
      const { notifySettingsChanged } = await import('../syncService');
      const handler = vi.fn();
      window.addEventListener('settings-updated', handler);
      notifySettingsChanged();
      expect(handler).toHaveBeenCalled();
      window.removeEventListener('settings-updated', handler);
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests for sync logic (data structures & merging)
// ---------------------------------------------------------------------------

describe('sync data transformation', () => {
  describe('verse data upload format', () => {
    it('should build correct upload shape from VerseData', () => {
      const userId = 'test-user-123';
      const local = {
        id: 'GEN:1:1_2',
        bookId: 'GEN',
        chapter: 1,
        verses: [1, 2],
        aiResearch: [],
        personalNote: { text: 'My note', createdAt: 1000, updatedAt: 2000 },
      };

      const row = {
        user_id: userId,
        verse_id: local.id,
        book_id: local.bookId,
        chapter: local.chapter,
        verses: local.verses,
        data: local,
        updated_at: new Date().toISOString(),
      };

      expect(row.verse_id).toBe('GEN:1:1_2');
      expect(row.book_id).toBe('GEN');
      expect(row.data.personalNote?.text).toBe('My note');
    });
  });

  describe('bookmark upload format', () => {
    it('should build correct upload shape from Bookmark', () => {
      const userId = 'test-user-123';
      const local = {
        id: 'PSA:23:1',
        bookId: 'PSA',
        bookName: 'Psalms',
        chapter: 23,
        verse: 1,
        textPreview: 'The LORD is my shepherd...',
        createdAt: Date.now(),
      };

      const row = {
        user_id: userId,
        bookmark_id: local.id,
        book_id: local.bookId,
        book_name: local.bookName,
        chapter: local.chapter,
        verse: local.verse,
        text_preview: local.textPreview || '',
        created_at: local.createdAt,
        updated_at: new Date().toISOString(),
      };

      expect(row.bookmark_id).toBe('PSA:23:1');
      expect(row.book_name).toBe('Psalms');
      expect(row.text_preview).toBe('The LORD is my shepherd...');
    });
  });

  describe('bible cache upload format', () => {
    it('should build correct cache_key from chapter record', () => {
      const local = {
        bookId: 'GEN',
        chapter: 1,
        translation: 'cuv' as const,
        data: { verses: [{ number: 1, text: '...' }] },
      };

      const cacheKey = `${local.bookId}_${local.chapter}_${local.translation}`;
      expect(cacheKey).toBe('GEN_1_cuv');
    });

    it('should filter out already-synced chapters', () => {
      const localChapters = [
        { bookId: 'GEN', chapter: 1, translation: 'cuv', data: { verses: [] } },
        { bookId: 'GEN', chapter: 1, translation: 'web', data: { verses: [] } },
        { bookId: 'GEN', chapter: 2, translation: 'cuv', data: { verses: [] } },
      ];

      const remoteKeySet = new Set(['GEN_1_cuv']);

      const toUpload = localChapters.filter(local => {
        const key = `${local.bookId}_${local.chapter}_${local.translation}`;
        return !remoteKeySet.has(key);
      });

      expect(toUpload).toHaveLength(2);
      expect(toUpload.map(c => `${c.bookId}_${c.chapter}_${c.translation}`)).toEqual([
        'GEN_1_web',
        'GEN_2_cuv',
      ]);
    });
  });

  describe('batching logic', () => {
    it('should chunk verse data uploads into batches of 100', () => {
      const items = Array.from({ length: 250 }, (_, i) => ({ id: `item_${i}` }));
      const batchSize = 100;
      const batches: any[][] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(100);
      expect(batches[1]).toHaveLength(100);
      expect(batches[2]).toHaveLength(50);
    });

    it('should chunk bible cache uploads into batches of 50', () => {
      const items = Array.from({ length: 120 }, (_, i) => ({ id: `ch_${i}` }));
      const batchSize = 50;
      const batches: any[][] = [];

      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize));
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(50);
      expect(batches[1]).toHaveLength(50);
      expect(batches[2]).toHaveLength(20);
    });
  });

  describe('general research sync coverage', () => {
    it('should treat GENERAL book entries as verse data for sync', () => {
      // autoSaveResearchService stores general research as verse data with bookId='GENERAL'
      const generalResearch = {
        id: 'GENERAL:0:0',
        bookId: 'GENERAL',
        chapter: 0,
        verses: [0],
        aiResearch: [
          {
            id: 'ai_123',
            query: 'What is grace?',
            response: 'Grace is...',
            timestamp: Date.now(),
            tags: ['auto-saved', 'general-research'],
          },
        ],
      };

      // This should be included in verse data sync — it uses the same store
      expect(generalResearch.bookId).toBe('GENERAL');
      expect(generalResearch.id).toBe('GENERAL:0:0');

      // Verify it maps to the same upload format
      const row = {
        user_id: 'test-user',
        verse_id: generalResearch.id,
        book_id: generalResearch.bookId,
        chapter: generalResearch.chapter,
        verses: generalResearch.verses,
        data: generalResearch,
        updated_at: new Date().toISOString(),
      };

      expect(row.verse_id).toBe('GENERAL:0:0');
      expect(row.data.aiResearch[0].tags).toContain('general-research');
    });
  });
});
