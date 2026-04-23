import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Y_NORM_PAGE_HEIGHT } from '../notabilityStrokeMigration';

/**
 * Integration test for the multi-page notability cross-device sync bug
 * (user-reported 2026-04-21, confirmed on 3 devices): "I have 2 page notes,
 * only the 1st page is synced. The 2nd page is missing in the other device."
 *
 * Two failure modes this file guards:
 *   F1. Byte-identical round-trip: JSON serialized on device A must come
 *       back unchanged on device B (no sync-layer column-list or
 *       localToRemoteJournal / remoteToLocalJournal regressions drop
 *       page-2 strokes).
 *   F2. The sync layer augments notability_data with a canvasHeightPages
 *       hint so receivers can reconstruct multi-page layout. See
 *       services/notabilityCanvasMigration.ts for the full rationale.
 *
 * Pure-unit tests for the augment helper live in
 * notabilityCanvasMigration.test.ts (split per R4).
 */

// Supabase mock — tracks upsert/select calls and (critically) persists
// upserts back into mockSupabaseData so a subsequent pull sees them.
// This round-trip behavior is what makes the "device A pushes, device B
// pulls" scenario real; the peer sync tests mock Supabase too but only
// track call shapes, not the data.
const mockSupabaseData: Record<string, any[]> = {};
const mockUpsertCalls: Array<{ table: string; data: any }> = [];
type SelectCall = { table: string; columns: string; eqCalls: Array<{ col: string; val: any }>; gteCalls: Array<{ col: string; val: any }> };
const mockSelectCalls: SelectCall[] = [];

const mockFrom = (table: string) => ({
  select: (cols?: string, opts?: any) => {
    const call: SelectCall = { table, columns: cols || '*', eqCalls: [], gteCalls: [] };
    mockSelectCalls.push(call);
    const builder: any = {
      eq: (col: string, val: any) => { call.eqCalls.push({ col, val }); return builder; },
      gte: (col: string, val: any) => { call.gteCalls.push({ col, val }); return builder; },
      single: () => Promise.resolve({ data: (mockSupabaseData[table] || [])[0] || null, error: null }),
      maybeSingle: () => Promise.resolve({ data: (mockSupabaseData[table] || [])[0] || null, error: null }),
      in: () => Promise.resolve({ data: mockSupabaseData[table] || [], error: null }),
    };
    const resolveShape = () => ({
      data: opts?.head ? null : (mockSupabaseData[table] || []),
      error: null,
      count: (mockSupabaseData[table] || []).length,
    });
    builder.then = (resolve: any) => resolve(resolveShape());
    return builder;
  },
  upsert: (data: any) => {
    mockUpsertCalls.push({ table, data });
    mockSupabaseData[table] = mockSupabaseData[table] || [];
    for (const row of (Array.isArray(data) ? data : [data])) {
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
    put: vi.fn(async (s: string, v: any, k?: string) => { idbStores[s]?.set(k ?? v.id ?? v.reference ?? v.key, v); }),
    get: vi.fn(async (s: string, k: string) => idbStores[s]?.get(k) ?? undefined),
    getAll: vi.fn(async (s: string) => Array.from(idbStores[s]?.values() ?? [])),
    getAllKeys: vi.fn(async (s: string) => Array.from(idbStores[s]?.keys() ?? [])),
    getAllFromIndex: vi.fn(async (s: string) => Array.from(idbStores[s]?.values() ?? [])),
    delete: vi.fn(async (s: string, k: string) => { idbStores[s]?.delete(k); }),
    count: vi.fn(async (s: string) => idbStores[s]?.size ?? 0),
    clear: vi.fn(async (s: string) => { idbStores[s]?.clear(); }),
    transaction: vi.fn(() => ({
      objectStore: vi.fn(() => ({ getAll: vi.fn(async () => []), put: vi.fn(), delete: vi.fn(), openCursor: vi.fn(async () => null) })),
      done: Promise.resolve(),
    })),
  }),
}));

const lsData: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => lsData[k] ?? null,
  setItem: (k: string, v: string) => { lsData[k] = v; },
  removeItem: (k: string) => { delete lsData[k]; },
});
vi.stubGlobal('navigator', { onLine: true });

// Fixture: a notability JSON payload matching ExtendedCanvasData. Stroke
// points use HEIGHT-normalized y, textboxes use WIDTH-normalized y (see
// NotabilityEditor.getNormalizedPoint). Page 2 content is anything with
// y > 0.5 in stroke coords or y > PAGE_HEIGHT/width in textbox coords.
// Builds a canonical 2-page notability doc in the F3 (page-height-
// normalized) encoding. In this encoding `y=1.5` is halfway down page 2
// — the old fixture used y=0.7 and labeled it "page 2" based on a
// misread of the legacy width-normalized heuristic, which this test was
// inadvertently pinning. After fixing the root-cause heuristic in
// `pagesFromStrokeMaxY`, the fixture must express "page 2" correctly.
function makeTwoPageNotabilityJSON(): string {
  return JSON.stringify({
    version: 2,
    yNormBase: Y_NORM_PAGE_HEIGHT,
    paperType: 'ruled',
    pageMode: 'seamless',
    strokes: [
      // Page 1 stroke (y in [0, 1))
      { points: [{ x: 0.1, y: 0.05 }, { x: 0.3, y: 0.06 }], color: '#000', lineWidth: 0.002, tool: 'pen', opacity: 1 },
      // Page 2 stroke (y in [1, 2))
      { points: [{ x: 0.1, y: 1.4 }, { x: 0.3, y: 1.42 }], color: '#C00', lineWidth: 0.002, tool: 'pen', opacity: 1 },
    ],
    textBoxes: [
      // textBoxes are still width-normalized y; bottom > PAGE_HEIGHT/REFERENCE_WIDTH (1.5) for page 2.
      { id: 'tb1', x: 0.1, y: 0.1, width: 0.3, height: 0.05, content: '<p>Page 1 note</p>' },
      { id: 'tb2', x: 0.1, y: 1.7, width: 0.3, height: 0.05, content: '<p>Page 2 note</p>' },
    ],
    images: [],
  });
}

describe('multi-page notability sync (user-reported 2026-04-21)', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const k of Object.keys(mockSupabaseData)) delete mockSupabaseData[k];
    mockUpsertCalls.length = 0;
    mockSelectCalls.length = 0;
    resetIdb();
    for (const k of Object.keys(lsData)) delete lsData[k];
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* suppress */ });
    vi.spyOn(console, 'log').mockImplementation(() => { /* suppress */ });
    vi.spyOn(console, 'warn').mockImplementation(() => { /* suppress */ });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function seedLocalEntry(id: string, updated: string, notabilityData: string) {
    idbStores.journal.set(id, {
      id, title: 't', content: '', plainText: '', drawing: '', blocks: [],
      notabilityData, tags: [], createdAt: updated, updatedAt: updated,
    });
  }

  // F1 — Round-trip preservation across devices.
  it('device A pushes a 2-page notabilityData; device B pull+lazy-fetch sees all pages', async () => {
    const ID = 'journal_multipage_1';
    const DEVICE_A_UPDATED = new Date('2026-04-21T10:00:00Z').toISOString();
    seedLocalEntry(ID, DEVICE_A_UPDATED, makeTwoPageNotabilityJSON());

    const { syncService } = await import('../syncService');
    await syncService.syncJournal();

    const upserted = mockUpsertCalls.find((c) => c.table === 'journal');
    expect(upserted).toBeDefined();
    const uploadedRow = Array.isArray(upserted!.data) ? upserted!.data[0] : upserted!.data;
    expect(uploadedRow.id).toBe(ID);
    expect(typeof uploadedRow.notability_data).toBe('string');
    const uploadedParsed = JSON.parse(uploadedRow.notability_data);
    expect(uploadedParsed.strokes).toHaveLength(2);
    expect(uploadedParsed.textBoxes).toHaveLength(2);

    // ── Device B: fresh IDB, reset sync state, then pull + lazy-fetch. ──
    resetIdb();
    for (const k of Object.keys(lsData)) delete lsData[k];
    await syncService.syncJournal();

    const metaPull = mockSelectCalls.find(
      (c) => c.table === 'journal' && c.columns.includes('title') && !c.columns.includes('notability_data')
    );
    expect(metaPull).toBeDefined();
    expect(idbStores.journal.has(ID)).toBe(true);

    await syncService.fetchJournalEntryBody(ID);
    const pulled = idbStores.journal.get(ID);
    expect(pulled).toBeDefined();

    const roundTripped = JSON.parse(pulled.notabilityData);
    expect(roundTripped.strokes).toHaveLength(2);
    expect(roundTripped.textBoxes).toHaveLength(2);
    const page2Stroke = roundTripped.strokes.find((s: any) => s.points.some((p: any) => p.y > 0.5));
    expect(page2Stroke, 'page-2 stroke (y > 0.5) must survive round-trip').toBeDefined();
    const page2Text = roundTripped.textBoxes.find((tb: any) => tb.y > 0.5);
    expect(page2Text, 'page-2 textbox (y > 0.5) must survive round-trip').toBeDefined();
    expect(page2Text.content).toBe('<p>Page 2 note</p>');
  });

  // F2 — Upload must augment notability_data with canvasHeightPages hint
  // so the receiving device can reconstruct multi-page layout. The hint
  // is a top-level integer (>=1) read by the editor's load path instead
  // of its buggy maxContentY*width reconstruction.
  it('upload augments notability_data with a canvasHeight hint so receivers reconstruct multi-page layout', async () => {
    const ID = 'journal_multipage_hint';
    const UPDATED = new Date('2026-04-21T11:00:00Z').toISOString();
    seedLocalEntry(ID, UPDATED, makeTwoPageNotabilityJSON());

    const { syncService } = await import('../syncService');
    await syncService.syncJournal();

    const upserted = mockUpsertCalls.find((c) => c.table === 'journal');
    const row = Array.isArray(upserted!.data) ? upserted!.data[0] : upserted!.data;
    const parsed = JSON.parse(row.notability_data);
    expect(parsed.canvasHeightPages, 'expected canvasHeightPages hint in uploaded notability_data').toBeGreaterThanOrEqual(2);
  });

  // F3 — Legacy payloads (synced by a pre-fix device) get repaired on
  // download. Guards the case where an older device pushed a hint-less
  // payload that a newer device pulls.
  it('fetchJournalEntryBody repairs a hint-less remote payload on download', async () => {
    const ID = 'journal_legacy_nohint';
    const UPDATED = new Date('2026-04-21T12:00:00Z').toISOString();

    const legacyRemotePayload = makeTwoPageNotabilityJSON();
    expect(JSON.parse(legacyRemotePayload).canvasHeightPages).toBeUndefined();

    mockSupabaseData['journal'] = [
      { id: ID, content: '', blocks: [], notability_data: legacyRemotePayload, drawing: '', updated_at: UPDATED },
    ];

    const { syncService } = await import('../syncService');
    await syncService.fetchJournalEntryBody(ID);

    const pulled = idbStores.journal.get(ID);
    expect(pulled).toBeDefined();
    const parsed = JSON.parse(pulled.notabilityData);
    expect(parsed.canvasHeightPages, 'downloaded payload should be repaired with a hint').toBeGreaterThanOrEqual(2);
  });
});
