import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Integration tests for the two syncService silent-failure bugs surfaced by
 * ADR-0001 (2026-04-22):
 *
 *  - Bug 2 (syncService.ts:1133, now around L1266–1270 post PR #11): the
 *    per-step catch in `performFullSync` swallows errors. A failed push
 *    logs nothing, sets no status, and the user sees a green "synced"
 *    indicator while data silently didn't sync.
 *
 *  - Bug 3 (syncService.ts:197–264, `syncNotes`): the pull uses the
 *    single `lastNotesSync` timestamp for all local notes, so a local
 *    edit that happened before the last sync can be stomped by a newer
 *    remote write even though the user changed the note since. Fix:
 *    per-entry `sync_at` tracking stored in `sync_at_notes` under
 *    `bible_sync_module_timestamps`-style local storage.
 *
 * These are red before the fix and green after. Each test keeps its own
 * narrow supabase / idb mock so we can force specific failure modes.
 */

// --- syncManager spy (hoisted — vi.mock factories run before top-level code) ---
const setStatusSpy = vi.fn();
const startSyncSpy = vi.fn();
const stepStartSpy = vi.fn();
const stepDoneSpy = vi.fn();

// --- Supabase mock — per-table error injection -------------------------------
interface TableBehavior {
  selectRows?: any[];
  selectError?: { message: string } | null;
  selectCount?: number;
  upsertError?: { message: string } | null;
}
const tableBehavior: Record<string, TableBehavior> = {};

function resetBehavior() {
  for (const k of Object.keys(tableBehavior)) delete tableBehavior[k];
  setStatusSpy.mockClear();
  startSyncSpy.mockClear();
  stepStartSpy.mockClear();
  stepDoneSpy.mockClear();
}

function mockFrom(table: string) {
  const beh = tableBehavior[table] || {};
  const builder: any = {
    select: (_cols?: string, opts?: any) => {
      const chain: any = {
        eq: () => chain,
        gte: () => chain,
        single: () => Promise.resolve({ data: (beh.selectRows || [])[0] || null, error: beh.selectError || null }),
        maybeSingle: () => Promise.resolve({ data: (beh.selectRows || [])[0] || null, error: beh.selectError || null }),
      };
      // head-count path (used by syncJournal/syncSpiritualMemory for cheap count check)
      if (opts?.head) {
        chain.then = (resolve: any) => resolve({
          data: null,
          error: beh.selectError || null,
          count: beh.selectCount ?? (beh.selectRows || []).length,
        });
      } else {
        chain.then = (resolve: any) => resolve({
          data: beh.selectRows || [],
          error: beh.selectError || null,
          count: beh.selectCount ?? (beh.selectRows || []).length,
        });
      }
      return chain;
    },
    upsert: (_data: any, _options?: any) => {
      if (beh.upsertError) {
        return Promise.resolve({ data: null, error: beh.upsertError });
      }
      return Promise.resolve({ data: null, error: null });
    },
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
  };
  return builder;
}

vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => mockFrom(t),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
  authManager: {
    getUserId: () => 'test-user-silent-fail',
    subscribe: vi.fn(),
  },
  syncManager: {
    setStatus: setStatusSpy,
    getStatus: () => 'idle',
    startSync: startSyncSpy,
    stepStart: stepStartSpy,
    stepDone: stepDoneSpy,
    resetCancelled: vi.fn(),
    isCancelled: () => false,
    cancelSync: vi.fn(),
  },
  canSync: () => true,
}));

// --- IDB mock ----------------------------------------------------------------
const idbStores: Record<string, Map<string, any>> = {
  notes: new Map(),
  annotations: new Map(),
  journal: new Map(),
  chatHistory: new Map(),
  spiritualMemory: new Map(),
  verseData: new Map(),
  bookmarks: new Map(),
  bibleChapters: new Map(),
  metadata: new Map(),
};

function resetIdb() {
  for (const s of Object.values(idbStores)) s.clear();
}

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue({
    put: vi.fn(async (storeName: string, value: any, key?: string) => {
      const s = idbStores[storeName];
      if (s) s.set(key ?? value.id ?? value.reference ?? value.key, value);
    }),
    get: vi.fn(async (s: string, k: string) => idbStores[s]?.get(k) ?? undefined),
    getAll: vi.fn(async (s: string) => Array.from(idbStores[s]?.values() ?? [])),
    getAllKeys: vi.fn(async (s: string) => Array.from(idbStores[s]?.keys() ?? [])),
    getAllFromIndex: vi.fn(async (s: string) => Array.from(idbStores[s]?.values() ?? [])),
    delete: vi.fn(async (s: string, k: string) => { idbStores[s]?.delete(k); }),
    count: vi.fn(async (s: string) => idbStores[s]?.size ?? 0),
    clear: vi.fn(async (s: string) => { idbStores[s]?.clear(); }),
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

// --- localStorage mock -------------------------------------------------------
const lsData: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsData[k] ?? null,
  setItem: (k: string, v: string) => { lsData[k] = v; },
  removeItem: (k: string) => { delete lsData[k]; },
});
vi.stubGlobal('navigator', { onLine: true });

// ============================================================================

describe('Bug 2 — performFullSync no longer silently swallows per-step errors', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    resetBehavior();
    resetIdb();
    for (const k of Object.keys(lsData)) delete lsData[k];
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* suppress */ });
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('surfaces a failing journal push — logs [sync] prefix AND sets syncManager status to error', async () => {
    // Seed one local journal entry newer than lastJournalSync (0 in default state)
    // so the push step runs.
    idbStores.journal.set('j-err-1', {
      id: 'j-err-1',
      title: 'local edit',
      plainText: 'local edit',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Journal pull: no remote changes.
    tableBehavior['journal'] = {
      selectRows: [],
      selectCount: 0,
      // Push path: force upsert to fail with a Postgres-style error.
      upsertError: { message: 'journal upsert blew up (simulated)' },
    };

    const { syncService } = await import('../syncService');
    syncService._resetMutex();

    await syncService.performFullSync();

    // (a) syncManager.setStatus was called with 'error' and a reason.
    const errCalls = setStatusSpy.mock.calls.filter((args: any[]) => args[0] === 'error');
    expect(errCalls.length).toBeGreaterThan(0);
    const errMessages = errCalls.map((a: any[]) => String(a[1] || ''));
    expect(errMessages.some((m) => m.length > 0)).toBe(true);

    // (b) console.error was called with the [sync] prefix and the failure detail.
    const syncLogs = errorSpy.mock.calls.filter((args: any[]) =>
      typeof args[0] === 'string' && args[0].includes('[sync]')
    );
    expect(syncLogs.length).toBeGreaterThan(0);
    const joined = syncLogs.map((a: any[]) => a.map((x) => String(x)).join(' ')).join('\n');
    // The step name or the error message must appear so grep can find this.
    expect(joined).toMatch(/Journal|journal upsert blew up/);
  });
});

// ============================================================================

describe('Bug 3 — syncNotes uses per-entry sync_at, not a single lastNotesSync', () => {
  beforeEach(async () => {
    vi.resetModules();
    resetBehavior();
    resetIdb();
    for (const k of Object.keys(lsData)) delete lsData[k];
  });

  it('does NOT stomp a locally-newer note when remote updated_at > lastNotesSync but local edit happened AFTER last sync_at for that entry', async () => {
    const REF = 'GEN 1:1';
    const LOCAL_NEWEST = '<p>LOCAL newest draft — do not stomp</p>';
    const REMOTE_STALE = '<p>REMOTE older content</p>';

    // Timeline (ms):
    //   T=1000  last full sync; global lastNotesSync and this entry's sync_at both set to 1000.
    //   T=2000  local edit happens → notesStorage.lastModified=2000. Entry's sync_at stays at 1000.
    //   T=3000  remote edit happens somewhere (e.g. old device flushing a stale draft).
    //           Remote updated_at = 3000, remote content = REMOTE_STALE (still older than the local 2000 edit conceptually — last-writer-wins by WALL clock would overwrite, but per-entry sync_at correctly identifies that the local copy has unacknowledged edits that must not be dropped silently).
    //
    // The pre-fix code compares remoteTime (3000) against syncState.lastNotesSync (1000) and
    // overwrites the local note with REMOTE_STALE. With per-entry sync_at, we know this
    // entry's sync_at is 1000 and local has been edited since — so we MUST NOT overwrite
    // without conflict handling. The minimum correct behaviour defined in the brief is
    // "local edit is preserved (not stomped)".

    // Seed local note with local lastModified > sync_at for this entry.
    idbStores.notes.set(REF, { reference: REF, data: LOCAL_NEWEST, lastModified: 2000 });

    // Seed the module timestamps: lastNotesSync = 1000.
    lsData['bible-app-sync-state'] = JSON.stringify({
      lastNotesSync: 1000,
      lastAnnotationsSync: 0, lastHistorySync: 0, lastSettingsSync: 0,
      lastVerseDataSync: 0, lastBookmarksSync: 0, lastBibleCacheSync: 0,
      lastJournalSync: 0, lastChatHistorySync: 0, lastSpiritualMemorySync: 0,
    });
    // Seed per-entry sync_at for notes: GEN 1:1 last synced at T=1000.
    lsData['bible-sync-at-notes'] = JSON.stringify({ [REF]: 1000 });

    // Remote has an entry with updated_at = 3000 (newer than lastNotesSync=1000).
    tableBehavior['notes'] = {
      selectRows: [
        {
          reference: REF,
          content: REMOTE_STALE,
          updated_at: new Date(3000).toISOString(),
          user_id: 'test-user-silent-fail',
          book_id: 'GEN',
          chapter: 1,
          verse: 1,
        },
      ],
      selectCount: 1,
    };

    const { syncService } = await import('../syncService');
    await syncService.syncNotes();

    const afterSync = idbStores.notes.get(REF);
    expect(afterSync, 'note should still exist after sync').toBeDefined();
    // The key assertion: the local edit is preserved, NOT stomped by REMOTE_STALE.
    expect(afterSync.data).toBe(LOCAL_NEWEST);
  });
});

// ============================================================================
// Helper error paths (R16 — prove the new logging branches actually fire)
// These tests force localStorage.getItem / setItem to throw and assert that
// our helpers degrade gracefully AND emit a `[sync]` console.error rather
// than silently swallowing. R5 compliance self-test.
// ============================================================================

describe('Bug 3 helper — getNoteSyncAt / setNoteSyncAt error paths (R5)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const originalLs = globalThis.localStorage;

  beforeEach(async () => {
    vi.resetModules();
    resetBehavior();
    resetIdb();
    for (const k of Object.keys(lsData)) delete lsData[k];
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* suppress */ });
  });

  afterEach(() => {
    errorSpy.mockRestore();
    vi.stubGlobal('localStorage', originalLs);
  });

  it('getNoteSyncAt: on localStorage read failure, logs [sync] prefix AND degrades to empty map', async () => {
    // Force localStorage.getItem to throw — the catch must log + degrade.
    vi.stubGlobal('localStorage', {
      getItem: (_k: string) => { throw new Error('LS getItem boom'); },
      setItem: (_k: string, _v: string) => { /* not used here */ },
      removeItem: (_k: string) => { /* noop */ },
    });

    // Seed a remote note so the pull runs — if getNoteSyncAt throws uncaught
    // the whole sync fails before we can assert.
    tableBehavior['notes'] = {
      selectRows: [
        { reference: 'PSA 23:1', content: 'remote psalm', updated_at: new Date(5000).toISOString(), user_id: 'test-user-silent-fail', book_id: 'PSA', chapter: 23, verse: 1 },
      ],
      selectCount: 1,
    };

    const { syncService } = await import('../syncService');
    await expect(syncService.syncNotes()).resolves.not.toThrow();

    const matched = errorSpy.mock.calls.filter((args: any[]) =>
      typeof args[0] === 'string' && args[0].includes('[sync] getNoteSyncAt')
    );
    expect(matched.length).toBeGreaterThan(0);
  });

  it('setNoteSyncAt: on localStorage write failure (e.g. QuotaExceeded), logs [sync] prefix', async () => {
    // Narrow the stub to ONLY fail writes for the sync_at key. Other
    // localStorage writes (sync-state persistence, module timestamps)
    // must succeed so syncNotes completes end-to-end and reaches the
    // setNoteSyncAt path.
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => lsData[k] ?? null,
      setItem: (k: string, v: string) => {
        if (k === 'bible-sync-at-notes') {
          throw new Error('QuotaExceededError (simulated)');
        }
        lsData[k] = v;
      },
      removeItem: (k: string) => { delete lsData[k]; },
    });

    // Seed: one remote note the pull will accept (no local copy → remote wins
    // cleanly and setNoteSyncAt is called).
    tableBehavior['notes'] = {
      selectRows: [
        { reference: 'JHN 3:16', content: 'remote john', updated_at: new Date(9000).toISOString(), user_id: 'test-user-silent-fail', book_id: 'JHN', chapter: 3, verse: 16 },
      ],
      selectCount: 1,
    };

    const { syncService } = await import('../syncService');
    // The sync should NOT throw — a failed sync_at persist is logged, not fatal.
    await expect(syncService.syncNotes()).resolves.not.toThrow();

    const matched = errorSpy.mock.calls.filter((args: any[]) =>
      typeof args[0] === 'string' && args[0].includes('[sync] setNoteSyncAt')
    );
    expect(matched.length).toBeGreaterThan(0);
  });
});
