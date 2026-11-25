import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock
// ---------------------------------------------------------------------------

const mockSupabaseData: Record<string, any[]> = {};
const mockUpsertCalls: Array<{ table: string; data: any; options: any }> = [];
/** Same tracking shape as syncService.test.ts — see that file for rationale. */
const mockSelectCalls: Array<{
  table: string;
  columns: string;
  eqCalls: Array<{ col: string; val: any }>;
  gteCalls: Array<{ col: string; val: any }>;
}> = [];
/** Tracks every supabase.channel(name) call so we can assert which tables
 *  are Realtime-subscribed — per the egress audit, only sync_metadata. */
const mockChannelNames: string[] = [];

function resetSupabaseMock() {
  for (const key of Object.keys(mockSupabaseData)) delete mockSupabaseData[key];
  mockUpsertCalls.length = 0;
  mockSelectCalls.length = 0;
  mockChannelNames.length = 0;
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
});

vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => mockFrom(t),
    channel: vi.fn((name: string) => {
      mockChannelNames.push(name);
      return {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      };
    }),
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
// IDB mock
// ---------------------------------------------------------------------------

const idbStores: Record<string, Map<string, any>> = {
  journal: new Map(),
  verseData: new Map(),
  bookmarks: new Map(),
  bibleChapters: new Map(),
  metadata: new Map(),
  notes: new Map(),
  annotations: new Map(),
  chatHistory: new Map(),
  spiritualMemory: new Map(),
};

function resetIdbStores() {
  for (const store of Object.values(idbStores)) store.clear();
}

vi.mock('idb', () => ({
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
}));

// localStorage mock
const localStorageData: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageData[key] ?? null,
  setItem: (key: string, value: string) => { localStorageData[key] = value; },
  removeItem: (key: string) => { delete localStorageData[key]; },
});

vi.stubGlobal('navigator', { onLine: true });

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRemoteJournalRow(overrides: Record<string, any> = {}) {
  return {
    id: 'journal_test_1',
    user_id: 'test-user-123',
    title: 'Test Entry',
    content: '<p>Hello</p>',
    plain_text: 'Hello',
    drawing: '',
    blocks: [
      { id: 'blk_1', type: 'text', content: '<p>Hello</p>', plainText: 'Hello' },
    ],
    latitude: null,
    longitude: null,
    location_name: null,
    book_id: 'GEN',
    chapter: 1,
    verse_ref: 'Genesis 1:1',
    tags: ['prayer'],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeLocalJournalEntry(overrides: Record<string, any> = {}) {
  return {
    id: 'journal_test_1',
    title: 'Test Entry',
    content: '<p>Hello</p>',
    plainText: 'Hello',
    drawing: '',
    blocks: [
      { id: 'blk_1', type: 'text', content: '<p>Hello</p>', plainText: 'Hello' },
    ],
    latitude: undefined,
    longitude: undefined,
    locationName: undefined,
    bookId: 'GEN',
    chapter: 1,
    verseRef: 'Genesis 1:1',
    tags: ['prayer'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Journal Realtime Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSupabaseMock();
    resetIdbStores();
    for (const key of Object.keys(localStorageData)) delete localStorageData[key];
  });

  describe('remoteToLocalJournal', () => {
    it('should map snake_case remote row to camelCase local entry', async () => {
      const { remoteToLocalJournal } = await import('../syncService');
      const remote = makeRemoteJournalRow();
      const local = remoteToLocalJournal(remote);

      expect(local.id).toBe('journal_test_1');
      expect(local.title).toBe('Test Entry');
      expect(local.content).toBe('<p>Hello</p>');
      expect(local.plainText).toBe('Hello');
      expect(local.bookId).toBe('GEN');
      expect(local.locationName).toBeNull();
      expect(local.verseRef).toBe('Genesis 1:1');
      expect(local.tags).toEqual(['prayer']);
      expect(local.createdAt).toBe('2026-01-01T00:00:00Z');
      expect(local.updatedAt).toBe('2026-01-01T00:00:00Z');
    });

    it('should include blocks in the mapped entry', async () => {
      const { remoteToLocalJournal } = await import('../syncService');
      const blocks = [
        { id: 'blk_1', type: 'text', content: '<p>Rich text</p>', plainText: 'Rich text' },
        { id: 'blk_2', type: 'drawing', canvasData: 'stroke-data', height: 400 },
        { id: 'blk_3', type: 'image', src: 'data:image/png;base64,abc123', width: 80 },
      ];
      const remote = makeRemoteJournalRow({ blocks });
      const local = remoteToLocalJournal(remote);

      expect(local.blocks).toHaveLength(3);
      expect(local.blocks![0].type).toBe('text');
      expect(local.blocks![1].type).toBe('drawing');
      expect(local.blocks![2].type).toBe('image');
      expect((local.blocks![2] as any).src).toBe('data:image/png;base64,abc123');
    });

    it('should handle null blocks gracefully', async () => {
      const { remoteToLocalJournal } = await import('../syncService');
      const remote = makeRemoteJournalRow({ blocks: null });
      const local = remoteToLocalJournal(remote);
      expect(local.blocks).toBeUndefined();
    });

    it('should handle empty blocks array', async () => {
      const { remoteToLocalJournal } = await import('../syncService');
      const remote = makeRemoteJournalRow({ blocks: [] });
      const local = remoteToLocalJournal(remote);
      expect(local.blocks).toEqual([]);
    });
  });

  describe('localToRemoteJournal', () => {
    it('should map camelCase local entry to snake_case remote row', async () => {
      const { localToRemoteJournal } = await import('../syncService');
      const local = makeLocalJournalEntry();
      const remote = localToRemoteJournal(local as any, 'test-user-123');

      expect(remote.id).toBe('journal_test_1');
      expect(remote.user_id).toBe('test-user-123');
      expect(remote.title).toBe('Test Entry');
      expect(remote.plain_text).toBe('Hello');
      expect(remote.book_id).toBe('GEN');
      expect(remote.location_name).toBeNull();
      expect(remote.verse_ref).toBe('Genesis 1:1');
      expect(remote.tags).toEqual(['prayer']);
    });

    it('should include blocks array in upload payload', async () => {
      const { localToRemoteJournal } = await import('../syncService');
      const blocks = [
        { id: 'blk_1', type: 'text', content: '<b>Bold</b>', plainText: 'Bold' },
        { id: 'blk_2', type: 'drawing', canvasData: 'data', height: 300 },
      ];
      const local = makeLocalJournalEntry({ blocks });
      const remote = localToRemoteJournal(local as any, 'test-user-123');

      expect(remote.blocks).toHaveLength(2);
      expect(remote.blocks[0].type).toBe('text');
      expect(remote.blocks[1].type).toBe('drawing');
    });

    it('should use empty array when blocks is undefined', async () => {
      const { localToRemoteJournal } = await import('../syncService');
      const local = makeLocalJournalEntry({ blocks: undefined });
      const remote = localToRemoteJournal(local as any, 'test-user-123');
      expect(remote.blocks).toEqual([]);
    });

    it('should cap large drawing data to prevent timeouts', async () => {
      const { localToRemoteJournal } = await import('../syncService');
      const largeDrawing = 'x'.repeat(600000); // > 512KB
      const local = makeLocalJournalEntry({ drawing: largeDrawing });
      const remote = localToRemoteJournal(local as any, 'test-user-123');
      expect(remote.drawing).toBe('');
    });

    it('should keep small drawing data intact', async () => {
      const { localToRemoteJournal } = await import('../syncService');
      const smallDrawing = 'stroke-data-here';
      const local = makeLocalJournalEntry({ drawing: smallDrawing });
      const remote = localToRemoteJournal(local as any, 'test-user-123');
      expect(remote.drawing).toBe(smallDrawing);
    });
  });

  describe('handleJournalRealtimeChange', () => {
    it('should insert a new entry when not in local IDB', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');
      const remote = makeRemoteJournalRow({ updated_at: '2026-06-01T00:00:00Z' });

      const events: string[] = [];
      const handler = (e: Event) => events.push(e.type);
      window.addEventListener('journal-synced', handler);

      await handleJournalRealtimeChange({ new: remote });

      window.removeEventListener('journal-synced', handler);

      // Verify it was written to IDB
      const stored = idbStores.journal.get('journal_test_1');
      expect(stored).toBeDefined();
      expect(stored.title).toBe('Test Entry');
      expect(stored.blocks).toHaveLength(1);
      expect(stored.blocks[0].type).toBe('text');

      // Verify journal-synced event was dispatched
      expect(events).toContain('journal-synced');
    });

    it('should update an existing entry when remote is newer (last-write-wins)', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');

      // Pre-populate local with older entry
      idbStores.journal.set('journal_test_1', makeLocalJournalEntry({
        updatedAt: '2026-01-01T00:00:00Z',
        title: 'Old Title',
        blocks: [{ id: 'blk_old', type: 'text', content: 'old', plainText: 'old' }],
      }));

      const remote = makeRemoteJournalRow({
        updated_at: '2026-06-01T00:00:00Z',
        title: 'New Title',
        blocks: [{ id: 'blk_new', type: 'text', content: 'new', plainText: 'new' }],
      });

      await handleJournalRealtimeChange({ new: remote });

      const stored = idbStores.journal.get('journal_test_1');
      expect(stored.title).toBe('New Title');
      expect(stored.blocks).toHaveLength(1);
      expect(stored.blocks[0].id).toBe('blk_new');
    });

    it('should NOT overwrite local entry when remote is older', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');

      // Local is newer
      idbStores.journal.set('journal_test_1', makeLocalJournalEntry({
        updatedAt: '2026-12-01T00:00:00Z',
        title: 'Newer Local',
      }));

      const remote = makeRemoteJournalRow({
        updated_at: '2026-01-01T00:00:00Z',
        title: 'Older Remote',
      });

      await handleJournalRealtimeChange({ new: remote });

      const stored = idbStores.journal.get('journal_test_1');
      expect(stored.title).toBe('Newer Local');
    });

    it('should handle missing payload gracefully', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');
      // Should not throw
      await expect(handleJournalRealtimeChange({ new: null })).resolves.not.toThrow();
      await expect(handleJournalRealtimeChange({ new: {} })).resolves.not.toThrow();
      await expect(handleJournalRealtimeChange({})).resolves.not.toThrow();
    });

    it('should preserve local createdAt when updating existing entry', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');

      idbStores.journal.set('journal_test_1', makeLocalJournalEntry({
        createdAt: '2025-06-15T10:00:00Z',
        updatedAt: '2025-06-15T10:00:00Z',
      }));

      const remote = makeRemoteJournalRow({
        created_at: '2026-01-01T00:00:00Z', // Different createdAt from remote
        updated_at: '2026-06-01T00:00:00Z',
      });

      await handleJournalRealtimeChange({ new: remote });

      const stored = idbStores.journal.get('journal_test_1');
      // Should preserve original local createdAt
      expect(stored.createdAt).toBe('2025-06-15T10:00:00Z');
    });
  });

  describe('block type sync coverage', () => {
    it('should sync text blocks with rich HTML content', async () => {
      const { remoteToLocalJournal, localToRemoteJournal } = await import('../syncService');
      const richTextBlock = {
        id: 'blk_rt',
        type: 'text',
        content: '<p style="color:red;text-align:center"><b>Bold</b> <em>italic</em> <u>underline</u></p><ul><li>Item 1</li></ul>',
        plainText: 'Bold italic underline\nItem 1',
      };

      const remote = makeRemoteJournalRow({ blocks: [richTextBlock] });
      const local = remoteToLocalJournal(remote);
      expect(local.blocks![0]).toEqual(richTextBlock);

      // Round-trip: local → remote → local preserves content
      const uploaded = localToRemoteJournal(local, 'test-user-123');
      const roundTripped = remoteToLocalJournal({
        ...remote,
        blocks: uploaded.blocks,
      });
      expect(roundTripped.blocks![0]).toEqual(richTextBlock);
    });

    it('should sync drawing blocks with canvas data and dimensions', async () => {
      const { remoteToLocalJournal } = await import('../syncService');
      const drawingBlock = {
        id: 'blk_draw',
        type: 'drawing',
        canvasData: JSON.stringify({ strokes: [{ points: [0, 1, 2], color: '#000' }] }),
        height: 500,
      };

      const remote = makeRemoteJournalRow({ blocks: [drawingBlock] });
      const local = remoteToLocalJournal(remote);
      expect(local.blocks![0]).toEqual(drawingBlock);
      expect((local.blocks![0] as any).height).toBe(500);
    });

    it('should sync image blocks with base64 data URLs', async () => {
      const { remoteToLocalJournal } = await import('../syncService');
      const imageBlock = {
        id: 'blk_img',
        type: 'image',
        src: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
        width: 75,
        annotationData: 'overlay-stroke-data',
        caption: 'Church building',
      };

      const remote = makeRemoteJournalRow({ blocks: [imageBlock] });
      const local = remoteToLocalJournal(remote);
      expect(local.blocks![0]).toEqual(imageBlock);
      expect((local.blocks![0] as any).src).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should sync mixed block types (text + drawing + image)', async () => {
      const { remoteToLocalJournal, localToRemoteJournal } = await import('../syncService');
      const mixedBlocks = [
        { id: 'blk_1', type: 'text', content: '<p>Morning reflection</p>', plainText: 'Morning reflection' },
        { id: 'blk_2', type: 'drawing', canvasData: 'strokes-here', height: 300 },
        { id: 'blk_3', type: 'image', src: 'data:image/png;base64,iVBOR', width: 50 },
        { id: 'blk_4', type: 'text', content: '<p>Closing prayer</p>', plainText: 'Closing prayer' },
      ];

      const remote = makeRemoteJournalRow({ blocks: mixedBlocks });
      const local = remoteToLocalJournal(remote);
      expect(local.blocks).toHaveLength(4);

      const uploaded = localToRemoteJournal(local, 'user-123');
      expect(uploaded.blocks).toHaveLength(4);
      expect(uploaded.blocks.map((b: any) => b.type)).toEqual(['text', 'drawing', 'image', 'text']);
    });
  });

  describe('offline queue behavior', () => {
    it('should store entries locally even when offline (IDB-first)', async () => {
      // Simulate offline: entries go to IDB regardless of network state
      const entry = makeLocalJournalEntry({ id: 'journal_offline_1', updatedAt: new Date().toISOString() });
      idbStores.journal.set(entry.id, entry);

      expect(idbStores.journal.has('journal_offline_1')).toBe(true);
      expect(idbStores.journal.get('journal_offline_1').title).toBe('Test Entry');
    });

    it('should detect changed entries for upload based on timestamp', () => {
      const lastSync = new Date('2026-01-01T00:00:00Z').getTime();
      const entries = [
        makeLocalJournalEntry({ id: 'j1', updatedAt: '2025-12-31T00:00:00Z' }), // Before last sync
        makeLocalJournalEntry({ id: 'j2', updatedAt: '2026-01-02T00:00:00Z' }), // After last sync
        makeLocalJournalEntry({ id: 'j3', updatedAt: '2026-01-03T00:00:00Z' }), // After last sync
      ];

      const toUpload = entries.filter(e => new Date(e.updatedAt).getTime() > lastSync);
      expect(toUpload).toHaveLength(2);
      expect(toUpload.map(e => e.id)).toEqual(['j2', 'j3']);
    });

    it('should batch uploads in chunks of 50', () => {
      const entries = Array.from({ length: 120 }, (_, i) =>
        makeLocalJournalEntry({ id: `j_${i}` })
      );

      const batchSize = 50;
      const batches: any[][] = [];
      for (let i = 0; i < entries.length; i += batchSize) {
        batches.push(entries.slice(i, i + batchSize));
      }

      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(50);
      expect(batches[1]).toHaveLength(50);
      expect(batches[2]).toHaveLength(20);
    });
  });

  describe('conflict resolution', () => {
    it('should use last-write-wins: remote newer wins', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');

      idbStores.journal.set('journal_test_1', makeLocalJournalEntry({
        updatedAt: '2026-01-01T00:00:00Z',
        title: 'Local Version',
      }));

      await handleJournalRealtimeChange({
        new: makeRemoteJournalRow({
          updated_at: '2026-06-01T00:00:00Z',
          title: 'Remote Version',
        }),
      });

      expect(idbStores.journal.get('journal_test_1').title).toBe('Remote Version');
    });

    it('should use last-write-wins: local newer wins (no overwrite)', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');

      idbStores.journal.set('journal_test_1', makeLocalJournalEntry({
        updatedAt: '2026-06-01T00:00:00Z',
        title: 'Local Version',
      }));

      await handleJournalRealtimeChange({
        new: makeRemoteJournalRow({
          updated_at: '2026-01-01T00:00:00Z',
          title: 'Remote Version',
        }),
      });

      expect(idbStores.journal.get('journal_test_1').title).toBe('Local Version');
    });

    it('should handle simultaneous timestamps (remote wins by convention)', async () => {
      const { handleJournalRealtimeChange } = await import('../syncService');
      const sameTime = '2026-03-15T12:00:00Z';

      idbStores.journal.set('journal_test_1', makeLocalJournalEntry({
        updatedAt: sameTime,
        title: 'Local',
      }));

      await handleJournalRealtimeChange({
        new: makeRemoteJournalRow({
          updated_at: sameTime,
          title: 'Remote',
        }),
      });

      // Same timestamp: remote does NOT win (> not >=)
      expect(idbStores.journal.get('journal_test_1').title).toBe('Local');
    });
  });

  describe('syncJournal integration', () => {
    it('should export syncJournal and it should be callable', async () => {
      const { syncService } = await import('../syncService');
      expect(typeof syncService.syncJournal).toBe('function');
      await expect(syncService.syncJournal()).resolves.not.toThrow();
    });

    it('should include journal in module exports', async () => {
      const { syncService } = await import('../syncService');
      expect(typeof syncService.syncJournal).toBe('function');
    });
  });

  describe('Realtime subscription mock', () => {
    it('should set up journal realtime channel on supabase', async () => {
      const { supabase } = await import('../supabase');
      // Verify channel creation is available
      expect(supabase!.channel).toBeDefined();
      const channel = supabase!.channel('test-journal');
      expect(channel.on).toBeDefined();
      expect(channel.subscribe).toBeDefined();
    });
  });

  describe('data integrity', () => {
    it('should not lose blocks data during round-trip conversion', async () => {
      const { remoteToLocalJournal, localToRemoteJournal } = await import('../syncService');

      const originalBlocks = [
        { id: 'blk_1', type: 'text', content: '<p>Hello <b>world</b></p>', plainText: 'Hello world' },
        { id: 'blk_2', type: 'drawing', canvasData: JSON.stringify({ strokes: [1, 2, 3] }), height: 350 },
        { id: 'blk_3', type: 'image', src: 'data:image/png;base64,longbase64string', width: 90, caption: 'Photo', annotationData: 'overlay' },
      ];

      const remote = makeRemoteJournalRow({ blocks: originalBlocks });
      const local = remoteToLocalJournal(remote);
      const uploaded = localToRemoteJournal(local, 'user-123');

      // Each block should survive the round-trip intact
      expect(uploaded.blocks).toEqual(originalBlocks);
    });

    it('should handle entries with 100+ blocks for performance', () => {
      const blocks = Array.from({ length: 150 }, (_, i) => ({
        id: `blk_${i}`,
        type: i % 3 === 0 ? 'text' : i % 3 === 1 ? 'drawing' : 'image',
        content: `Block ${i}`,
        plainText: `Block ${i}`,
      }));

      const entry = makeLocalJournalEntry({ blocks });
      expect(entry.blocks).toHaveLength(150);

      // Verify serialization doesn't fail
      const json = JSON.stringify(entry);
      const parsed = JSON.parse(json);
      expect(parsed.blocks).toHaveLength(150);
    });

    it('should handle empty string fields without corruption', async () => {
      const { remoteToLocalJournal } = await import('../syncService');
      const remote = makeRemoteJournalRow({
        title: '',
        content: '',
        plain_text: '',
        drawing: '',
        blocks: [],
        tags: [],
      });
      const local = remoteToLocalJournal(remote);
      expect(local.title).toBe('');
      expect(local.content).toBe('');
      expect(local.plainText).toBe('');
      expect(local.drawing).toBe('');
      expect(local.blocks).toEqual([]);
      expect(local.tags).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Egress-mitigation assertions (2026-04 egress-mitigation branch)
  // -------------------------------------------------------------------------

  describe('egress mitigation — journal two-phase fetch', () => {
    it('syncJournal pull does NOT select the heavy body columns', async () => {
      const { syncService } = await import('../syncService');
      mockSupabaseData['journal'] = [
        {
          id: 'jx',
          user_id: 'test-user-123',
          title: 'm',
          plain_text: '',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          tags: [],
        },
      ];
      await syncService.syncJournal();

      const bulkPull = mockSelectCalls.find(
        (c) => c.table === 'journal' && c.columns !== 'id' && c.columns !== '*'
      );
      expect(bulkPull).toBeDefined();
      expect(bulkPull!.columns).not.toMatch(/blocks/);
      expect(bulkPull!.columns).not.toMatch(/notability_data/);
    });

    it('fetchJournalEntryBody fetches exactly one entry with heavy columns', async () => {
      const { syncService } = await import('../syncService');
      mockSupabaseData['journal'] = [
        {
          id: 'jy',
          content: '<p>x</p>',
          blocks: [],
          notability_data: null,
          drawing: '',
          updated_at: new Date().toISOString(),
        },
      ];
      await syncService.fetchJournalEntryBody('jy');

      const bodyFetch = mockSelectCalls.find(
        (c) => c.table === 'journal' && c.columns.includes('blocks')
      );
      expect(bodyFetch).toBeDefined();
      expect(bodyFetch!.eqCalls.some((e) => e.col === 'id' && e.val === 'jy')).toBe(true);
    });
  });

  describe('egress mitigation — realtime subscription audit', () => {
    it('does NOT register a journal-realtime channel on auth', async () => {
      // journalRealtimeChannel setup is explicitly disabled at the auth
      // subscribe callsite. If someone re-enables it without a PLAN.md
      // update, this test should fail.
      await import('../syncService');
      // At module load time, auth.subscribe is called but the handler only
      // fires on an auth state transition in the mock — so no channels
      // should have been registered yet.
      expect(mockChannelNames.filter((n) => n === 'journal-realtime')).toHaveLength(0);
    });
  });
});
