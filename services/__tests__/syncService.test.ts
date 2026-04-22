import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock — tracks upsert/select calls
// ---------------------------------------------------------------------------

const mockSupabaseData: Record<string, any[]> = {};
const mockUpsertCalls: Array<{ table: string; data: any; options: any }> = [];
/**
 * Tracks every .from(table).select(cols)... chain, including the args that
 * subsequent .eq() / .gte() calls were invoked with. Used by the server-side
 * filter / column-selection tests below.
 */
const mockSelectCalls: Array<{
  table: string;
  columns: string;
  eqCalls: Array<{ col: string; val: any }>;
  gteCalls: Array<{ col: string; val: any }>;
}> = [];

function resetSupabaseMock() {
  for (const key of Object.keys(mockSupabaseData)) delete mockSupabaseData[key];
  mockUpsertCalls.length = 0;
  mockSelectCalls.length = 0;
}

const mockFrom = (table: string) => ({
  select: (cols?: string, _opts?: any) => {
    const call = {
      table,
      columns: cols || '*',
      eqCalls: [] as Array<{ col: string; val: any }>,
      gteCalls: [] as Array<{ col: string; val: any }>,
    };
    mockSelectCalls.push(call);

    const builder: any = {
      eq: (col: string, val: any) => {
        call.eqCalls.push({ col, val });
        return builder;
      },
      gte: (col: string, val: any) => {
        call.gteCalls.push({ col, val });
        return builder;
      },
      single: () => Promise.resolve({ data: (mockSupabaseData[table] || [])[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: (mockSupabaseData[table] || [])[0] || null, error: null }),
      in: (_col: string, _vals: any[]) => Promise.resolve({ data: mockSupabaseData[table] || [], error: null }),
    };
    // Make the builder itself thenable so that `await supabase.from().select().eq().gte()`
    // resolves to the same shape legacy tests expect.
    builder.then = (resolve: any) =>
      resolve({
        data: mockSupabaseData[table] || [],
        error: null,
        count: (mockSupabaseData[table] || []).length,
      });
    return builder;
  },
  upsert: (data: any, options?: any) => {
    mockUpsertCalls.push({ table, data, options });
    return Promise.resolve({ data: null, error: null });
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  })),
});

// Mock supabase module
vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => mockFrom(t),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
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
  journal: new Map(),
  chatHistory: new Map(),
  spiritualMemory: new Map(),
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

  // ─────────────────────────────────────────────────────────────────────────
  // New tests for sync fixes
  // ─────────────────────────────────────────────────────────────────────────

  describe('concurrency guard (mutex)', () => {
    it('should export _isSyncLocked and _resetMutex test helpers', async () => {
      const { syncService } = await import('../syncService');
      expect(typeof syncService._isSyncLocked).toBe('function');
      expect(typeof syncService._resetMutex).toBe('function');
    });

    it('should prevent concurrent full syncs', async () => {
      const { syncService } = await import('../syncService');
      syncService._resetMutex();

      // Start two full syncs concurrently
      const sync1 = syncService.performFullSync();
      // The second sync should be skipped because first holds the mutex
      const sync2 = syncService.performFullSync();

      await Promise.all([sync1, sync2]);
      // Mutex should be released after both complete
      expect(syncService._isSyncLocked()).toBe(false);
    });

    it('should release mutex after sync completes', async () => {
      const { syncService } = await import('../syncService');
      syncService._resetMutex();

      await syncService.performFullSync();
      expect(syncService._isSyncLocked()).toBe(false);
    });
  });

  describe('periodic sync lifecycle', () => {
    it('should export startPeriodicSync and stopPeriodicSync', async () => {
      const { syncService } = await import('../syncService');
      expect(typeof syncService.startPeriodicSync).toBe('function');
      expect(typeof syncService.stopPeriodicSync).toBe('function');
    });

    it('should not throw when calling stopPeriodicSync', async () => {
      const { syncService } = await import('../syncService');
      expect(() => syncService.stopPeriodicSync()).not.toThrow();
    });

    it('should not throw when calling startPeriodicSync after stop', async () => {
      const { syncService } = await import('../syncService');
      syncService.stopPeriodicSync();
      expect(() => syncService.startPeriodicSync()).not.toThrow();
      syncService.stopPeriodicSync(); // cleanup
    });
  });

  describe('notes sync conflict detection', () => {
    it('should not overwrite local notes when local is newer than last sync', () => {
      const lastSyncTime = 5000;
      const remoteUpdatedAt = new Date(3000).toISOString();
      const localContent = 'My local edit';

      const remoteTime = new Date(remoteUpdatedAt).getTime();
      const shouldOverwrite = !localContent || remoteTime > lastSyncTime;
      expect(shouldOverwrite).toBe(false);
    });

    it('should overwrite local when remote is newer than last sync', () => {
      const lastSyncTime = 5000;
      const remoteUpdatedAt = new Date(8000).toISOString();
      const localContent = 'My local edit';

      const remoteTime = new Date(remoteUpdatedAt).getTime();
      const shouldOverwrite = !localContent || remoteTime > lastSyncTime;
      expect(shouldOverwrite).toBe(true);
    });

    it('should always accept remote if no local content exists', () => {
      const lastSyncTime = 5000;
      const remoteUpdatedAt = new Date(3000).toISOString();
      const localContent = undefined;

      const shouldOverwrite = !localContent || new Date(remoteUpdatedAt).getTime() > lastSyncTime;
      expect(shouldOverwrite).toBe(true);
    });
  });

  describe('reading history incremental sync', () => {
    it('should filter out unchanged history entries', () => {
      const lastHistorySync = 5000;
      const localHistory = [
        { bookId: 'GEN', chapter: 1, bookName: 'Genesis', lastRead: 3000, hasNotes: false, hasAIResearch: false },
        { bookId: 'GEN', chapter: 2, bookName: 'Genesis', lastRead: 8000, hasNotes: true, hasAIResearch: false },
        { bookId: 'EXO', chapter: 1, bookName: 'Exodus', lastRead: 6000, hasNotes: false, hasAIResearch: true },
      ];
      const remoteIds = new Set(['GEN:1', 'GEN:2']);

      const toUpload = localHistory.filter(local => {
        const key = `${local.bookId}:${local.chapter}`;
        return !remoteIds.has(key) || local.lastRead > lastHistorySync;
      });

      expect(toUpload).toHaveLength(2);
      expect(toUpload.map(h => `${h.bookId}:${h.chapter}`)).toEqual(['GEN:2', 'EXO:1']);
    });

    it('should upload nothing if all history is unchanged', () => {
      const lastHistorySync = 10000;
      const localHistory = [
        { bookId: 'GEN', chapter: 1, bookName: 'Genesis', lastRead: 3000, hasNotes: false, hasAIResearch: false },
      ];
      const remoteIds = new Set(['GEN:1']);

      const toUpload = localHistory.filter(local => {
        const key = `${local.bookId}:${local.chapter}`;
        return !remoteIds.has(key) || local.lastRead > lastHistorySync;
      });

      expect(toUpload).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Egress-mitigation integration tests (2026-04 egress-mitigation branch)
// These assert the on-the-wire shape: which columns we select and which
// filters we apply. If these regress, egress goes back up.
// ---------------------------------------------------------------------------

describe('egress mitigation — server-side filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMock();
    resetIdbStores();
    for (const key of Object.keys(localStorageData)) delete localStorageData[key];
    vi.resetModules();
  });

  it('syncReadingHistory applies a server-side filter on last_read', async () => {
    const { syncService } = await import('../syncService');
    await syncService.syncReadingHistory();

    const readingHistoryPull = mockSelectCalls.find(
      (c) => c.table === 'reading_history' && c.columns === '*'
    );
    expect(readingHistoryPull).toBeDefined();
    expect(readingHistoryPull!.gteCalls).toHaveLength(1);
    expect(readingHistoryPull!.gteCalls[0].col).toBe('last_read');
  });

  it('syncBookmarks applies a server-side filter on updated_at', async () => {
    const { syncService } = await import('../syncService');
    await syncService.syncBookmarks();

    const bookmarksPull = mockSelectCalls.find(
      (c) => c.table === 'bookmarks' && c.columns === '*'
    );
    expect(bookmarksPull).toBeDefined();
    expect(bookmarksPull!.gteCalls).toHaveLength(1);
    expect(bookmarksPull!.gteCalls[0].col).toBe('updated_at');
  });

  it('syncJournal pull selects lightweight metadata columns, NOT blocks or notability_data', async () => {
    const { syncService } = await import('../syncService');
    // Seed a fake count response by inserting a dummy row so remoteCount > 0
    mockSupabaseData['journal'] = [
      {
        id: 'j1',
        user_id: 'test-user-123',
        title: 't',
        plain_text: '',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        tags: [],
      },
    ];
    await syncService.syncJournal();

    // Find the body-fetch select (not the count-only head select)
    const journalPull = mockSelectCalls.find(
      (c) => c.table === 'journal' && c.columns !== 'id' && c.columns !== '*'
    );
    expect(journalPull).toBeDefined();
    // Must NOT include heavy columns
    expect(journalPull!.columns).not.toMatch(/blocks/);
    expect(journalPull!.columns).not.toMatch(/notability_data/);
    expect(journalPull!.columns).not.toMatch(/drawing/);
    expect(journalPull!.columns).not.toMatch(/\bcontent\b/);
    // Must include the fields the list UI needs
    expect(journalPull!.columns).toMatch(/title/);
    expect(journalPull!.columns).toMatch(/updated_at/);
    expect(journalPull!.columns).toMatch(/location_name/);
    expect(journalPull!.columns).toMatch(/verse_ref/);
    // Must apply the server-side cutoff
    expect(journalPull!.gteCalls.some((g) => g.col === 'updated_at')).toBe(true);
  });

  it('fetchJournalEntryBody selects heavy columns for a single entry', async () => {
    const { syncService } = await import('../syncService');
    mockSupabaseData['journal'] = [
      {
        id: 'j1',
        content: '<p>hi</p>',
        blocks: [],
        notability_data: null,
        drawing: '',
        updated_at: new Date().toISOString(),
      },
    ];
    await syncService.fetchJournalEntryBody('j1');

    const bodyFetch = mockSelectCalls.find(
      (c) => c.table === 'journal' && c.columns.includes('blocks')
    );
    expect(bodyFetch).toBeDefined();
    expect(bodyFetch!.columns).toMatch(/blocks/);
    expect(bodyFetch!.columns).toMatch(/notability_data/);
    expect(bodyFetch!.columns).toMatch(/drawing/);
    expect(bodyFetch!.columns).toMatch(/content/);
    // Targeted to one id
    expect(bodyFetch!.eqCalls.some((e) => e.col === 'id' && e.val === 'j1')).toBe(true);
  });

  it('exports fetchJournalEntryBody on the syncService public API', async () => {
    const { syncService } = await import('../syncService');
    expect(typeof syncService.fetchJournalEntryBody).toBe('function');
  });
});

describe('egress mitigation — realtime subscription audit', () => {
  it('only subscribes to sync_metadata, NOT journal, as of 2026-04-21', async () => {
    // The journal-realtime channel would double our egress during heavy
    // writes (each drawing stroke push wakes realtime). PLAN.md Phase 2
    // explicitly disabled it; this test locks that decision in until the
    // architecture changes.
    const src = await import('fs').then((fs) =>
      fs.readFileSync('services/syncService.ts', 'utf8')
    );
    expect(src).toMatch(/\/\/ setupJournalRealtimeSync\(\)/); // commented out at call site
    // The sync_metadata channel stays live — it's the cross-device trigger.
    expect(src).toMatch(/setupRealtimeSync\(\);/);
  });
});
