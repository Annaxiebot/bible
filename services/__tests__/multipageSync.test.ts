import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Integration test for the multi-page notability cross-device sync bug
 * (user-reported 2026-04-21, confirmed on 3 devices):
 *
 *   "The note does sync across device, but some notes are missing. For
 *   example, I have 2 page notes, only the 1st page is synced. The 2nd
 *   page is missing in the other device."
 *
 * The content of a multi-page notability canvas is serialized by
 * NotabilityEditor as a single JSON string stored in `notabilityData`.
 * In multi-page mode the user expands the canvas past PAGE_HEIGHT; page 2
 * content lives at normalized y > PAGE_HEIGHT / canvasHeight (i.e. y values
 * up to ~1.0 when there are 2 pages). The save-time format does NOT record
 * `canvasHeight` or a `pages[]` array — it relies on the receiving device
 * reconstructing canvasHeight from `maxContentY` at load time.
 *
 * Two failure modes for cross-device sync surface here:
 *
 *   F1. The JSON must round-trip through the sync pipeline byte-identical
 *       (serialize on device A → store on Supabase → pull on device B →
 *       deserialize). If any step drops fields (e.g. the lazy-fetch
 *       column list excludes notability_data, or remoteToLocalJournal
 *       loses fields), page 2's strokes are gone from the payload entirely.
 *
 *   F2. Even when the JSON round-trips intact, the receiving device must
 *       be able to reconstruct canvasHeight from the strokes alone so
 *       page 2 content renders on a second page and not squashed into
 *       page 1. We add a `canvasHeight` hint into the serialized payload
 *       at sync-layer time (see services/notabilityCanvasMigration.ts)
 *       so older device versions also reconstruct correctly.
 */

const mockSupabaseData: Record<string, any[]> = {};
const mockUpsertCalls: Array<{ table: string; data: any }> = [];
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
  select: (cols?: string, opts?: any) => {
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
    if (opts?.head) {
      builder.then = (resolve: any) =>
        resolve({
          data: null,
          error: null,
          count: (mockSupabaseData[table] || []).length,
        });
    } else {
      builder.then = (resolve: any) =>
        resolve({
          data: mockSupabaseData[table] || [],
          error: null,
          count: (mockSupabaseData[table] || []).length,
        });
    }
    return builder;
  },
  upsert: (data: any, _options?: any) => {
    mockUpsertCalls.push({ table, data });
    // Persist the upsert rows into the mock row store so a subsequent
    // pull from a "second device" sees them — mirrors a real Supabase
    // round-trip.
    if (!mockSupabaseData[table]) mockSupabaseData[table] = [];
    const rows = Array.isArray(data) ? data : [data];
    for (const row of rows) {
      const idx = mockSupabaseData[table].findIndex((r: any) => r.id === row.id);
      if (idx >= 0) mockSupabaseData[table][idx] = row;
      else mockSupabaseData[table].push(row);
    }
    return Promise.resolve({ data: null, error: null });
  },
  channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
});

vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => mockFrom(t),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
  authManager: {
    getUserId: () => 'multipage-user',
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
    delete: vi.fn(async (s: string, k: string) => {
      idbStores[s]?.delete(k);
    }),
    count: vi.fn(async (s: string) => idbStores[s]?.size ?? 0),
    clear: vi.fn(async (s: string) => {
      idbStores[s]?.clear();
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

const lsData: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsData[k] ?? null,
  setItem: (k: string, v: string) => {
    lsData[k] = v;
  },
  removeItem: (k: string) => {
    delete lsData[k];
  },
});
vi.stubGlobal('navigator', { onLine: true });

// ---------------------------------------------------------------------------
// Helpers: build a notability JSON payload that matches the NotabilityEditor
// serialize format but with two pages' worth of content.
//
// NotabilityEditor serializes ExtendedCanvasData = {
//   version: 2, strokes: NormalizedStroke[], paperType, textBoxes, images, pageMode
// }
// where stroke points are NORMALIZED BY THE CANVAS HEIGHT AT SAVE TIME.
// For a 2-page canvas (canvasHeight = 2 * PAGE_HEIGHT), a stroke drawn on
// pixel y=1600 has normalized y = 1600 / 2400 ≈ 0.667 — i.e. on page 2.
// ---------------------------------------------------------------------------

const PAGE_HEIGHT = 1200;

function makeTwoPageNotabilityJSON(): string {
  return JSON.stringify({
    version: 2,
    paperType: 'ruled',
    pageMode: 'seamless',
    // Canvas was 2 * PAGE_HEIGHT at save time.
    // Each point is {x, y} normalized so x in [0,1] across width, y in [0,1]
    // across canvasHeight. Hence a point with y=0.8 is on page 2 (y=960 at
    // canvasHeight=1200 is on page 1, but at canvasHeight=2400 it's on page 2).
    strokes: [
      // Page 1 stroke (top of canvas)
      {
        points: [
          { x: 0.1, y: 0.05 },
          { x: 0.2, y: 0.08 },
          { x: 0.3, y: 0.06 },
        ],
        color: '#000000',
        lineWidth: 0.002,
        tool: 'pen',
        opacity: 1,
      },
      // Page 2 stroke (below y=0.5 boundary in 2-page coords)
      {
        points: [
          { x: 0.1, y: 0.7 },
          { x: 0.2, y: 0.75 },
          { x: 0.3, y: 0.72 },
        ],
        color: '#CC0000',
        lineWidth: 0.002,
        tool: 'pen',
        opacity: 1,
      },
    ],
    textBoxes: [
      // Page 1 textbox
      { id: 'tb1', x: 0.1, y: 0.1, width: 0.3, height: 0.05, content: '<p>Page 1 note</p>' },
      // Page 2 textbox
      { id: 'tb2', x: 0.1, y: 0.8, width: 0.3, height: 0.05, content: '<p>Page 2 note</p>' },
    ],
    images: [],
  });
}

describe('multi-page notability sync (user-reported 2026-04-21)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    resetSupabaseMock();
    resetIdb();
    for (const k of Object.keys(lsData)) delete lsData[k];
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* suppress */ });
    vi.spyOn(console, 'log').mockImplementation(() => { /* suppress */ });
    vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  // -------------------------------------------------------------------------
  // (F1) Round-trip preservation: the JSON must come back identical.
  // -------------------------------------------------------------------------
  it('device A pushes a 2-page notabilityData; device B pull+lazy-fetch sees all pages', async () => {
    const ID = 'journal_multipage_1';
    const DEVICE_A_UPDATED = new Date('2026-04-21T10:00:00Z').toISOString();
    const originalPayload = makeTwoPageNotabilityJSON();

    // ── Device A: local entry with 2-page notabilityData ──
    idbStores.journal.set(ID, {
      id: ID,
      title: 'Two-page note',
      content: '',
      plainText: 'Page 1 note Page 2 note',
      drawing: '',
      blocks: [],
      notabilityData: originalPayload,
      tags: [],
      createdAt: DEVICE_A_UPDATED,
      updatedAt: DEVICE_A_UPDATED,
    });

    const { syncService } = await import('../syncService');

    // Push from device A.
    await syncService.syncJournal();

    // The upserted row was captured — verify notability_data is full.
    const upserted = mockUpsertCalls.find((c) => c.table === 'journal');
    expect(upserted).toBeDefined();
    const uploadedRow = Array.isArray(upserted!.data) ? upserted!.data[0] : upserted!.data;
    expect(uploadedRow.id).toBe(ID);
    expect(typeof uploadedRow.notability_data).toBe('string');
    expect(uploadedRow.notability_data.length).toBeGreaterThan(100);

    const uploadedParsed = JSON.parse(uploadedRow.notability_data);
    expect(uploadedParsed.strokes).toHaveLength(2);
    expect(uploadedParsed.textBoxes).toHaveLength(2);

    // ── Device B: fresh IDB (empty), then pull metadata + lazy-fetch body ──
    resetIdb(); // simulate another device with no local journal yet
    // Reset per-module sync timestamps so syncJournal sees remote as new.
    for (const k of Object.keys(lsData)) delete lsData[k];

    // Metadata pull
    await syncService.syncJournal();

    // Sanity: device B saw the metadata row
    const metaPull = mockSelectCalls.find(
      (c) => c.table === 'journal' && c.columns.includes('title') && !c.columns.includes('notability_data')
    );
    expect(metaPull).toBeDefined();
    expect(idbStores.journal.has(ID)).toBe(true);

    // Lazy-fetch the heavy body (this is what JournalView does when the user
    // opens an entry).
    await syncService.fetchJournalEntryBody(ID);

    const pulled = idbStores.journal.get(ID);
    expect(pulled).toBeDefined();
    expect(typeof pulled.notabilityData).toBe('string');

    // F1: Byte-identical round-trip of the JSON payload.
    const roundTripped = JSON.parse(pulled.notabilityData);
    expect(roundTripped.strokes).toHaveLength(2);
    expect(roundTripped.textBoxes).toHaveLength(2);
    // Page 2 stroke (y>0.5) is preserved
    const page2Stroke = roundTripped.strokes.find((s: any) =>
      s.points.some((p: any) => p.y > 0.5)
    );
    expect(page2Stroke, 'page-2 stroke (normalized y > 0.5) must survive the sync round-trip').toBeDefined();
    const page2Text = roundTripped.textBoxes.find((tb: any) => tb.y > 0.5);
    expect(page2Text, 'page-2 text box (y > 0.5) must survive the sync round-trip').toBeDefined();
    expect(page2Text.content).toBe('<p>Page 2 note</p>');
  });

  // -------------------------------------------------------------------------
  // (F2) canvasHeight must be reconstructible on the receiving device so
  // page 2 strokes render on page 2 (not squashed into page 1).
  //
  // The fix adds a `canvasHeight` hint to the sync payload. This test
  // asserts that hint is present in the uploaded row and parseable.
  // -------------------------------------------------------------------------
  it('upload augments notability_data with a canvasHeight hint so receivers reconstruct multi-page layout', async () => {
    const ID = 'journal_multipage_hint';
    const UPDATED = new Date('2026-04-21T11:00:00Z').toISOString();

    idbStores.journal.set(ID, {
      id: ID,
      title: 'Hint check',
      content: '',
      plainText: '',
      drawing: '',
      blocks: [],
      notabilityData: makeTwoPageNotabilityJSON(),
      tags: [],
      createdAt: UPDATED,
      updatedAt: UPDATED,
    });

    const { syncService } = await import('../syncService');
    await syncService.syncJournal();

    const upserted = mockUpsertCalls.find((c) => c.table === 'journal');
    const row = Array.isArray(upserted!.data) ? upserted!.data[0] : upserted!.data;
    const parsed = JSON.parse(row.notability_data);

    // The fix adds a top-level `canvasHeightPages` integer recording how
    // many PAGE_HEIGHT units of canvas existed at save time. For the
    // fixture JSON above the highest content y is 0.8 → we need at least
    // 2 pages. Receivers that haven't upgraded ignore the field; receivers
    // that have upgraded use it instead of the (buggy) maxContentY*width
    // reconstruction.
    expect(parsed.canvasHeightPages, 'expected canvasHeightPages hint in uploaded notability_data').toBeGreaterThanOrEqual(2);
  });

  // -------------------------------------------------------------------------
  // (F3) The hint must be computed from stroke/text/image positions —
  // verify the helper directly. See notabilityCanvasMigration.ts for
  // the exact contract of computeNotabilityPagesHint.
  // -------------------------------------------------------------------------
  describe('computeNotabilityPagesHint', () => {
    it('returns 1 when all strokes / textboxes / images fit within a single page', async () => {
      const { computeNotabilityPagesHint } = await import('../notabilityCanvasMigration');
      // Strokes well inside the first page (height-norm y < 0.5) and a
      // textbox at y=0.3 (width-norm, 0.3 * 800 = 240 px < PAGE_HEIGHT).
      const onePage = {
        version: 2,
        strokes: [{ points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] }],
        textBoxes: [{ y: 0.3, height: 0.05 }],
        images: [],
      };
      expect(computeNotabilityPagesHint(onePage)).toBe(1);
    });

    it('returns >=2 when a stroke is past the height-norm 0.5 boundary', async () => {
      const { computeNotabilityPagesHint } = await import('../notabilityCanvasMigration');
      const twoPages = {
        version: 2,
        strokes: [{ points: [{ x: 0.1, y: 0.7 }] }],
        textBoxes: [],
        images: [],
      };
      expect(computeNotabilityPagesHint(twoPages)).toBeGreaterThanOrEqual(2);
    });

    it('returns >=2 when a textbox is at width-norm y > PAGE_HEIGHT/width', async () => {
      const { computeNotabilityPagesHint } = await import('../notabilityCanvasMigration');
      // textbox at width-norm y=1.5 → 1.5 * 800 = 1200 px = exactly page 2 top.
      // With tb.height=0.05, bottom=1.55 → 1.55*800=1240 px → 2 pages.
      const twoPages = {
        version: 2,
        strokes: [],
        textBoxes: [{ y: 1.5, height: 0.05 }],
        images: [],
      };
      expect(computeNotabilityPagesHint(twoPages)).toBeGreaterThanOrEqual(2);
    });

    it('is idempotent: augmenting twice produces the same JSON', async () => {
      const { augmentNotabilityJSON } = await import('../notabilityCanvasMigration');
      const raw = makeTwoPageNotabilityJSON();
      const once = augmentNotabilityJSON(raw) as string;
      const twice = augmentNotabilityJSON(once) as string;
      expect(twice).toBe(once);
    });

    it('returns input unchanged for non-version-2 payloads, empty strings, and malformed JSON', async () => {
      const { augmentNotabilityJSON } = await import('../notabilityCanvasMigration');
      expect(augmentNotabilityJSON('')).toBe('');
      expect(augmentNotabilityJSON(null)).toBe(null);
      expect(augmentNotabilityJSON(undefined)).toBe(undefined);
      expect(augmentNotabilityJSON('{not json')).toBe('{not json');
      expect(augmentNotabilityJSON(JSON.stringify({ version: 1, foo: 'bar' })))
        .toBe(JSON.stringify({ version: 1, foo: 'bar' }));
    });
  });

  // -------------------------------------------------------------------------
  // (F4) Downloaded notability_data should also have the hint filled in
  // so that legacy payloads (synced before this fix) get repaired on
  // lazy-fetch. Guards against the case where an older device pushes a
  // hint-less payload that a newer device pulls.
  // -------------------------------------------------------------------------
  it('fetchJournalEntryBody repairs a hint-less remote payload on download', async () => {
    const ID = 'journal_legacy_nohint';
    const UPDATED = new Date('2026-04-21T12:00:00Z').toISOString();

    // Remote has a legacy payload with no canvasHeightPages field.
    const legacyRemotePayload = makeTwoPageNotabilityJSON();
    expect(JSON.parse(legacyRemotePayload).canvasHeightPages).toBeUndefined();

    mockSupabaseData['journal'] = [
      {
        id: ID,
        content: '',
        blocks: [],
        notability_data: legacyRemotePayload,
        drawing: '',
        updated_at: UPDATED,
      },
    ];

    const { syncService } = await import('../syncService');
    await syncService.fetchJournalEntryBody(ID);

    const pulled = idbStores.journal.get(ID);
    expect(pulled).toBeDefined();
    const parsed = JSON.parse(pulled.notabilityData);
    expect(parsed.canvasHeightPages, 'downloaded payload should be repaired with a hint').toBeGreaterThanOrEqual(2);
  });
});
