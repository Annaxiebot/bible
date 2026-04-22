/**
 * syncService.ts
 * 
 * Handles bidirectional sync between local storage (IndexedDB/localStorage) 
 * and Supabase cloud storage. Works only when user is authenticated.
 * 
 * Features:
 * - Manual and automatic sync
 * - Conflict resolution (last-write-wins)
 * - Background sync on app startup
 * - Incremental sync (only changed items)
 */

import {
  supabase,
  authManager,
  syncManager,
  canSync,
} from './supabase';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { notesStorage } from './notesStorage';
import { annotationStorage, AnnotationRecord } from './annotationStorage';
import { readingHistory } from './readingHistory';
import { verseDataStorage } from './verseDataStorage';
import { bookmarkStorage } from './bookmarkStorage';
import { bibleStorage, BibleTranslation } from './bibleStorage';
import type { VerseData } from '../types/verseData';
import type { Bookmark } from './idbService';

// =====================================================
// SYNC STATE
// =====================================================

interface SyncState {
  lastNotesSync: number;
  lastAnnotationsSync: number;
  lastHistorySync: number;
  lastSettingsSync: number;
  lastVerseDataSync: number;
  lastBookmarksSync: number;
  lastBibleCacheSync: number;
  lastJournalSync: number;
  lastChatHistorySync: number;
  lastSpiritualMemorySync: number;
}

const SYNC_STATE_KEY = STORAGE_KEYS.SYNC_STATE;

const DEFAULT_SYNC_STATE: SyncState = {
  lastNotesSync: 0,
  lastAnnotationsSync: 0,
  lastHistorySync: 0,
  lastSettingsSync: 0,
  lastVerseDataSync: 0,
  lastBookmarksSync: 0,
  lastBibleCacheSync: 0,
  lastJournalSync: 0,
  lastChatHistorySync: 0,
  lastSpiritualMemorySync: 0,
};

function getSyncState(): SyncState {
  try {
    const data = localStorage.getItem(SYNC_STATE_KEY);
    return data ? { ...DEFAULT_SYNC_STATE, ...JSON.parse(data) } : { ...DEFAULT_SYNC_STATE };
  } catch {
    return { ...DEFAULT_SYNC_STATE };
  }
}

function setSyncState(state: Partial<SyncState>) {
  const current = getSyncState();
  const updated = { ...current, ...state };
  localStorage.setItem(SYNC_STATE_KEY, JSON.stringify(updated));
}

// =====================================================
// MODULE TIMESTAMPS (per-module last-modified tracking)
// =====================================================

type SyncModule =
  | 'notes' | 'annotations' | 'readingHistory' | 'settings'
  | 'verseData' | 'bookmarks' | 'bibleCache' | 'journal' | 'chatHistory'
  | 'spiritualMemory';

const ALL_MODULES: SyncModule[] = [
  'notes', 'annotations', 'readingHistory', 'settings',
  'verseData', 'bookmarks', 'journal', 'chatHistory',
  'spiritualMemory',
  // 'bibleCache' — disabled to reduce Disk IO (Bible text cached locally via bible-api.com)
];

const MODULE_TS_KEY = 'bible_sync_module_timestamps';

// ── Concurrency guard: prevent overlapping sync operations ──
let syncMutexLocked = false;
let syncMutexQueue: Array<() => void> = [];

async function acquireSyncMutex(): Promise<boolean> {
  if (syncMutexLocked) return false;
  syncMutexLocked = true;
  return true;
}

function releaseSyncMutex(): void {
  syncMutexLocked = false;
  const next = syncMutexQueue.shift();
  if (next) next();
}

// ── Global backoff: stop syncing after 503/throttle errors ──
let syncBackoffUntil = 0; // timestamp — skip sync until this time
let consecutiveFailures = 0;
const BACKOFF_BASE_MS = 30_000; // 30 seconds initial backoff
const BACKOFF_MAX_MS = 300_000; // 5 minutes max backoff

function isSyncThrottled(): boolean {
  return Date.now() < syncBackoffUntil;
}

function handleSyncError(error: any): void {
  // Detect 503 / throttle / network errors
  const is503 = error?.status === 503 || error?.statusCode === 503
    || (error?.message && /503|Service Unavailable|Could not query/i.test(error.message));
  const isNetworkError = error?.message && /fetch|network|timeout/i.test(error.message);

  if (is503 || isNetworkError) {
    consecutiveFailures++;
    const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1), BACKOFF_MAX_MS);
    syncBackoffUntil = Date.now() + backoffMs;
    console.warn(`[Sync] Backing off for ${Math.round(backoffMs / 1000)}s after ${consecutiveFailures} failure(s)`);
  }
}

function resetSyncBackoff(): void {
  consecutiveFailures = 0;
  syncBackoffUntil = 0;
}

function getLocalTimestamps(): Record<SyncModule, number> {
  try {
    const data = localStorage.getItem(MODULE_TS_KEY);
    const parsed = data ? JSON.parse(data) : {};
    const result: Record<string, number> = {};
    for (const m of ALL_MODULES) result[m] = parsed[m] || 0;
    return result as Record<SyncModule, number>;
  } catch { return Object.fromEntries(ALL_MODULES.map(m => [m, 0])) as Record<SyncModule, number>; }
}

function setLocalTimestamp(module: SyncModule, ts: number): void {
  const current = getLocalTimestamps();
  current[module] = ts;
  localStorage.setItem(MODULE_TS_KEY, JSON.stringify(current));
}

async function updateServerTimestamp(module: SyncModule, ts: number): Promise<void> {
  if (!supabase || !canSync()) return;
  const userId = authManager.getUserId();
  if (!userId) return;
  try {
    await supabase.from('sync_metadata').upsert(
      { user_id: userId, module, last_modified: ts, updated_at: new Date(ts).toISOString() },
      { onConflict: 'user_id,module' }
    );
  } catch { /* fire-and-forget */ }
}

async function fetchServerTimestamps(): Promise<Record<string, number>> {
  if (!supabase || !canSync() || isSyncThrottled()) return {};
  const userId = authManager.getUserId();
  if (!userId) return {};
  const { data, error } = await supabase
    .from('sync_metadata')
    .select('module, last_modified')
    .eq('user_id', userId);
  if (error) { handleSyncError(error); return {}; }
  resetSyncBackoff();
  const result: Record<string, number> = {};
  for (const row of data || []) result[row.module] = row.last_modified;
  return result;
}

function stampModule(module: SyncModule): void {
  const ts = Date.now();
  setLocalTimestamp(module, ts);
  updateServerTimestamp(module, ts); // fire-and-forget
}

export function notifySettingsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('settings-updated'));
}

// =====================================================
// NOTES SYNC
// =====================================================

/**
 * Per-entry sync_at tracking for notes (ADR-0001 recommendation 6 /
 * brief Bug 3). Stored as `{ [reference]: timestampMs }`. Replaces the
 * single `lastNotesSync` timestamp for pull-merge decisions so that a
 * local edit made AFTER the last per-entry sync but BEFORE the next
 * pull is not silently stomped by a newer remote `updated_at`.
 *
 * Migration: if an entry has no recorded sync_at (existing data), we
 * treat it as 0 — the first pull resolves correctly because remote
 * `updated_at` > 0 forces the remote into local when there is no
 * ambiguity, OR we defer to the tie-breaker (keep local) when the
 * local note's `lastModified` is also > 0.
 */
const NOTES_SYNC_AT_KEY = 'bible-sync-at-notes';

function getNoteSyncAt(): Record<string, number> {
  try {
    const raw = localStorage.getItem(NOTES_SYNC_AT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    // R5: a corrupt sync_at map (bad JSON, or SecurityError from a sandboxed
    // storage context) is recoverable — treating every entry as sync_at=0
    // degrades gracefully to "first pull" semantics, which keeps local
    // content when localMod > 0 and otherwise accepts remote. We log so a
    // truly broken store surfaces in devtools rather than being invisible.
    console.error('[sync] getNoteSyncAt: failed to read per-entry sync_at map, degrading to {}:', err);
    return {};
  }
}

function setNoteSyncAt(ref: string, ts: number): void {
  const cur = getNoteSyncAt();
  cur[ref] = ts;
  try {
    localStorage.setItem(NOTES_SYNC_AT_KEY, JSON.stringify(cur));
  } catch (err) {
    // R5: persisting sync_at can fail with QuotaExceededError (Safari
    // private browsing most often) or SecurityError. If it fails the
    // next pull for this entry will re-evaluate against an older
    // sync_at — which is conservative (we'd at worst re-accept remote
    // for an already-synced entry or preserve a local edit twice),
    // not corrupting. We log loudly so the user sees persistent
    // failures; silencing it here would let full-storage machines
    // drift into divergent state without anyone noticing.
    console.error(`[sync] setNoteSyncAt: failed to persist sync_at for ${ref}:`, err);
  }
}

async function syncNotes(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get local notes (map of reference → content) and raw records (for lastModified).
  const localNotes = await notesStorage.getAllNotes();
  const { idbService } = await import('./idbService');
  const localRaw = await idbService.getAll('notes');
  const localLastModified = new Map<string, number>();
  for (const rec of localRaw) {
    if (rec?.reference != null) {
      localLastModified.set(rec.reference, Number(rec.lastModified) || 0);
    }
  }

  // Get remote notes modified since last sync.
  // The global `lastNotesSync` is still used as a CUTOFF for the server-side
  // filter (so we don't pull the whole table every time). The per-entry
  // sync_at is the authority for the merge decision below.
  const syncState = getSyncState();
  const { data: remoteNotes, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', new Date(syncState.lastNotesSync).toISOString());

  if (error) {
    console.error('[sync] notes pull failed:', (error as any)?.message || String(error));
    throw error;
  }

  const syncAtMap = getNoteSyncAt();
  const remoteByRef = new Map((remoteNotes || []).map(n => [n.reference, n]));

  // Merge remote notes into local using PER-ENTRY sync_at (ADR-0001 Bug 3).
  // Previously this compared remote.updated_at against the GLOBAL
  // lastNotesSync, which meant:
  //    T=1000 last sync
  //    T=2000 local edit       ← lives only in localNotes[ref].lastModified
  //    T=3000 stale remote write arrives (older-body / new timestamp)
  //    next pull: remote(3000) > lastNotesSync(1000) → remote wins → local edit gone.
  // Per-entry sync_at makes the compare meaningful: if the local entry's
  // lastModified is newer than its sync_at, it has unacknowledged edits
  // and must not be silently clobbered.
  for (const remoteNote of remoteNotes || []) {
    const ref = remoteNote.reference;
    const remoteTime = new Date(remoteNote.updated_at).getTime();
    const entrySyncAt = syncAtMap[ref] || 0; // migration: missing → 0
    const localContent = localNotes[ref];
    const localMod = localLastModified.get(ref) || 0;

    // The local copy is "dirty" (has unacknowledged edits) if local was
    // modified after we last synced this specific entry.
    const localDirty = localMod > entrySyncAt;

    if (!localContent) {
      // No local copy — always accept remote.
      await notesStorage.saveNote(ref, remoteNote.content);
      setNoteSyncAt(ref, remoteTime);
    } else if (localDirty) {
      // Local has unacknowledged edits. R5: do not silently overwrite.
      // Strategy (minimal, correct): keep local. The push below will upload
      // it on this same sync, and the remote tie-break (remote
      // updated_at is newer wall-clock) would otherwise have caused a
      // silent data loss. If a real conflict-resolution UI lands later it
      // can hook here; this is the safe default until then.
      console.warn(`[sync] notes pull — preserving local edit for ${ref} (localMod=${localMod} > sync_at=${entrySyncAt}); remote updated_at=${remoteTime}`);
    } else if (remoteTime > entrySyncAt) {
      // Local is clean and remote is newer than what we last synced for
      // this entry — accept remote.
      await notesStorage.saveNote(ref, remoteNote.content);
      setNoteSyncAt(ref, remoteTime);
    }
  }

  // Upload local notes that don't exist remotely, OR whose local lastModified
  // is newer than their per-entry sync_at (dirty).
  const notesToUpload = Object.entries(localNotes)
    .filter(([reference]) => {
      const remote = remoteByRef.get(reference);
      const localMod = localLastModified.get(reference) || 0;
      const entrySyncAt = syncAtMap[reference] || 0;
      const dirty = localMod > entrySyncAt;
      return !remote || dirty;
    })
    .map(([reference, content]) => {
      const parts = reference.split(' ');
      const bookId = parts[0];
      const chapterVerse = parts.slice(1).join(' ');
      const [chapter, verse] = chapterVerse.split(':').map(n => parseInt(n, 10));
      return {
        user_id: userId,
        reference,
        book_id: bookId,
        chapter: chapter || 1,
        verse: verse || null,
        content,
        updated_at: new Date().toISOString()
      };
    });

  if (notesToUpload.length > 0 && canSync()) {
    const { error: upsertErr } = await supabase.from('notes').upsert(notesToUpload, { onConflict: 'user_id,reference' });
    if (upsertErr) {
      console.error('[sync] notes push failed:', (upsertErr as any)?.message || String(upsertErr));
      throw upsertErr;
    }
    // Confirm sync_at for each uploaded entry with the remote-confirmed wall-clock.
    // We used Date.now() above to stamp updated_at; use the same value for sync_at.
    const uploadedAt = Date.now();
    for (const row of notesToUpload) {
      setNoteSyncAt(row.reference, uploadedAt);
    }
  }

  setSyncState({ lastNotesSync: Date.now() });
}

// =====================================================
// ANNOTATIONS SYNC
// =====================================================

async function syncAnnotations(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get all local annotations from IndexedDB
  const localAnnotations: AnnotationRecord[] = await annotationStorage.getAllAnnotations();

  // Get remote annotations modified since last sync
  const syncState = getSyncState();
  const { data: remoteAnnotations, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', new Date(syncState.lastAnnotationsSync).toISOString());

  if (error) {
    // TODO: use error reporting service
    throw error;
  }

  // Merge remote annotations into local
  for (const remote of remoteAnnotations || []) {
    await annotationStorage.saveAnnotation(
      remote.book_id,
      remote.chapter,
      remote.canvas_data,
      remote.canvas_height,
      remote.panel_id as any
    );
  }

  // Upload local annotations to remote — batch upsert
  const annotationsToUpload = localAnnotations
    .filter(local => {
      const existingRemote = remoteAnnotations?.find(r =>
        r.book_id === local.bookId &&
        r.chapter === local.chapter &&
        (r.panel_id || '') === (local.panelId || '')
      );
      return !existingRemote || local.lastModified > new Date(existingRemote!.updated_at).getTime();
    })
    .map(local => ({
      user_id: userId,
      book_id: local.bookId,
      chapter: local.chapter,
      panel_id: local.panelId || '',
      canvas_data: local.canvasData,
      canvas_height: local.canvasHeight,
      updated_at: new Date(local.lastModified).toISOString()
    }));

  if (annotationsToUpload.length > 0 && canSync()) {
    await supabase.from('annotations').upsert(annotationsToUpload, { onConflict: 'user_id,book_id,chapter,panel_id' });
  }

  setSyncState({ lastAnnotationsSync: Date.now() });
}

// =====================================================
// READING HISTORY SYNC
// =====================================================

async function syncReadingHistory(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get local history
  const localHistory = readingHistory.getHistory();
  const lastRead = readingHistory.getLastRead();

  // EGRESS FIX: server-side filter on `last_read` (the reading_history table
  // has no `updated_at` column — see database/supabase-schema.sql line 103).
  // Previously this pulled the entire reading_history table every 5 min,
  // which for a user with 200+ read chapters meant ~50KB per sync × 288/day.
  // Now we only download rows whose last_read advanced since our last sync.
  const syncState = getSyncState();
  const historyCutoffISO = new Date(syncState.lastHistorySync).toISOString();
  console.log(`[sync] reading_history pull start — cutoff=${historyCutoffISO}`);
  const { data: remoteHistory, error: historyError } = await supabase
    .from('reading_history')
    .select('*')
    .eq('user_id', userId)
    .gte('last_read', historyCutoffISO);

  if (historyError) {
    console.error('[sync] reading_history pull failed:', historyError.message);
    throw historyError;
  }
  console.log(`[sync] reading_history pull end — rows=${(remoteHistory || []).length}`);

  // Merge remote into local
  for (const remote of remoteHistory || []) {
    readingHistory.addToHistory(
      remote.book_id,
      remote.book_name,
      remote.chapter,
      remote.has_notes,
      remote.has_ai_research
    );
  }

  // Upload only local history entries modified since last sync — not the entire history
  const syncState2 = getSyncState();
  const remoteIds = new Set((remoteHistory || []).map((r: { book_id: string; chapter: number }) => `${r.book_id}:${r.chapter}`));
  const historyToUpload = localHistory
    .filter(local => {
      const key = `${local.bookId}:${local.chapter}`;
      // Upload if: not on remote, or lastRead is newer than our last sync
      return !remoteIds.has(key) || local.lastRead > syncState2.lastHistorySync;
    })
    .map(local => ({
      user_id: userId,
      book_id: local.bookId,
      book_name: local.bookName,
      chapter: local.chapter,
      last_read: new Date(local.lastRead).toISOString(),
      has_notes: local.hasNotes || false,
      has_ai_research: local.hasAIResearch || false
    }));

  if (historyToUpload.length > 0 && canSync()) {
    await supabase.from('reading_history').upsert(historyToUpload, { onConflict: 'user_id,book_id,chapter' });
  }

  // Sync last read position
  if (lastRead && canSync()) {
    await supabase.from('last_read').upsert({
      user_id: userId,
      book_id: lastRead.bookId,
      book_name: lastRead.bookName,
      chapter: lastRead.chapter,
      updated_at: new Date(lastRead.timestamp).toISOString()
    }, {
      onConflict: 'user_id'
    });
  }

  // Get remote last read and update local if newer
  const { data: remoteLastRead } = await supabase
    .from('last_read')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (remoteLastRead) {
    const remoteTime = new Date(remoteLastRead.updated_at).getTime();
    const localTime = lastRead?.timestamp || 0;
    
    if (remoteTime > localTime) {
      readingHistory.saveLastRead(
        remoteLastRead.book_id,
        remoteLastRead.book_name,
        remoteLastRead.chapter
      );
    }
  }

  setSyncState({ lastHistorySync: Date.now() });
}

// =====================================================
// SETTINGS SYNC
// =====================================================

const SYNCED_SETTINGS_KEYS = [
  STORAGE_KEYS.AI_PROVIDER,
  STORAGE_KEYS.AI_MODEL,
  STORAGE_KEYS.GEMINI_API_KEY,
  STORAGE_KEYS.CLAUDE_API_KEY,
  STORAGE_KEYS.OPENAI_API_KEY,
  STORAGE_KEYS.KIMI_API_KEY,
  STORAGE_KEYS.OPENROUTER_API_KEY,
  STORAGE_KEYS.NVIDIA_API_KEY,
  STORAGE_KEYS.DEEPSEEK_API_KEY,
  STORAGE_KEYS.GROQ_API_KEY,
  STORAGE_KEYS.DASHSCOPE_API_KEY,
  STORAGE_KEYS.MINIMAX_API_KEY,
  STORAGE_KEYS.ZHIPU_API_KEY,
  STORAGE_KEYS.ZAI_API_KEY,
  STORAGE_KEYS.R9S_API_KEY,
  STORAGE_KEYS.MOONSHOT_API_KEY,
  STORAGE_KEYS.PERPLEXITY_API_KEY,
  STORAGE_KEYS.TAVILY_API_KEY,
  STORAGE_KEYS.FIRECRAWL_API_KEY,
  STORAGE_KEYS.EXA_API_KEY,
  STORAGE_KEYS.BRAVE_API_KEY,
  STORAGE_KEYS.AUTO_SAVE_RESEARCH,
  STORAGE_KEYS.ENGLISH_VERSION,
  STORAGE_KEYS.CHINESE_VERSION,
  STORAGE_KEYS.CHINESE_MODE,
  STORAGE_KEYS.FONT_SIZE,
  STORAGE_KEYS.VIEW_LAYOUT,
  'useFreeRouter',
  'useServerAI',
  'autoRaceAI',
  'webSearchProvider',
];

async function syncSettings(forceRemotePull = false): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get remote settings
  const { data: remote, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') { handleSyncError(error); return; }

  // Build local settings object
  const localSettings: Record<string, string> = {};
  for (const key of SYNCED_SETTINGS_KEYS) {
    const val = localStorage.getItem(key);
    if (val) localSettings[key] = val;
  }

  if (remote?.settings) {
    const remoteSettings = remote.settings as Record<string, string>;
    const remoteTime = new Date(remote.updated_at).getTime();
    const syncState = getSyncState();

    // Pull from remote if remote is newer OR if forced (manual/full sync)
    if (forceRemotePull || remoteTime > syncState.lastSettingsSync) {
      // Remote is newer — merge remote into local (remote wins)
      for (const [key, val] of Object.entries(remoteSettings)) {
        if (val && SYNCED_SETTINGS_KEYS.includes(key)) {
          localStorage.setItem(key, val);
          localSettings[key] = val;
        }
      }
    }
  }

  // Upload merged settings to remote
  if (!canSync()) return;
  await supabase.from('user_settings').upsert({
    user_id: userId,
    settings: localSettings,
    updated_at: new Date().toISOString()
  }, {
    onConflict: 'user_id'
  });

  setSyncState({ lastSettingsSync: Date.now() });
}

// =====================================================
// VERSE DATA SYNC (personal notes + AI research per verse)
// =====================================================
//
// Supabase table DDL:
//
// CREATE TABLE verse_data (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
//   verse_id TEXT NOT NULL,           -- e.g. "GEN:1:1" or "GENERAL:0:0"
//   book_id TEXT NOT NULL,
//   chapter INTEGER NOT NULL,
//   verses INTEGER[] NOT NULL,
//   data JSONB NOT NULL,              -- full VerseData object (personalNote + aiResearch)
//   updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
//   UNIQUE(user_id, verse_id)
// );
// CREATE INDEX idx_verse_data_user ON verse_data(user_id);
// ALTER TABLE verse_data ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users can manage own verse data" ON verse_data
//   FOR ALL USING (auth.uid() = user_id);
//

async function syncVerseData(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get all local verse data
  const localData: VerseData[] = await verseDataStorage.getAllData();

  // Get remote verse data modified since last sync
  const syncState = getSyncState();
  const { data: remoteRows, error } = await supabase
    .from('verse_data')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', new Date(syncState.lastVerseDataSync).toISOString());

  if (error) throw error;

  // Merge remote into local (remote wins on conflict)
  for (const remote of remoteRows || []) {
    const remoteVerseData = remote.data as VerseData;
    if (!remoteVerseData) continue;

    // Ensure id is set correctly
    remoteVerseData.id = remote.verse_id;
    await verseDataStorage.importData([remoteVerseData], 'merge');
  }

  // Upload local verse data modified since last sync
  const dataToUpload = localData
    .filter(local => new Date((local as any).updatedAt || 0).getTime() > syncState.lastVerseDataSync)
    .map(local => ({
      user_id: userId,
      verse_id: local.id,
      book_id: local.bookId,
      chapter: local.chapter,
      verses: local.verses,
      data: local,
      updated_at: new Date().toISOString(),
    }));

  if (dataToUpload.length > 0) {
    // Batch in chunks of 100 to avoid payload limits
    for (let i = 0; i < dataToUpload.length; i += 100) {
      if (!canSync()) break;
      const batch = dataToUpload.slice(i, i + 100);
      await supabase.from('verse_data').upsert(batch, { onConflict: 'user_id,verse_id' });
    }
  }

  setSyncState({ lastVerseDataSync: Date.now() });
}

// =====================================================
// BOOKMARKS SYNC
// =====================================================
//
// Supabase table DDL:
//
// CREATE TABLE bookmarks (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
//   bookmark_id TEXT NOT NULL,        -- e.g. "GEN:1:1"
//   book_id TEXT NOT NULL,
//   book_name TEXT NOT NULL,
//   chapter INTEGER NOT NULL,
//   verse INTEGER NOT NULL,
//   text_preview TEXT NOT NULL DEFAULT '',
//   created_at BIGINT NOT NULL,       -- epoch ms from client
//   updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
//   UNIQUE(user_id, bookmark_id)
// );
// CREATE INDEX idx_bookmarks_user ON bookmarks(user_id);
// ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users can manage own bookmarks" ON bookmarks
//   FOR ALL USING (auth.uid() = user_id);
//

async function syncBookmarks(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get all local bookmarks
  const localBookmarks: Bookmark[] = await bookmarkStorage.getAllBookmarks();

  // EGRESS FIX: server-side filter on updated_at. Previously pulled every
  // bookmark on every sync. With N bookmarks and a 5-min poll that's
  // O(N × 288) rows/day of pure redundancy.
  const syncState = getSyncState();
  const bookmarksCutoffISO = new Date(syncState.lastBookmarksSync).toISOString();
  console.log(`[sync] bookmarks pull start — cutoff=${bookmarksCutoffISO}`);
  const { data: remoteBookmarks, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', bookmarksCutoffISO);

  if (error) {
    console.error('[sync] bookmarks pull failed:', error.message);
    throw error;
  }
  console.log(`[sync] bookmarks pull end — rows=${(remoteBookmarks || []).length}`);

  // Build a set of local bookmark IDs for quick lookup
  const localIds = new Set(localBookmarks.map(b => b.id));

  // Merge remote into local — add any bookmarks we don't have locally
  for (const remote of remoteBookmarks || []) {
    if (!localIds.has(remote.bookmark_id)) {
      await bookmarkStorage.importBookmark({
        id: remote.bookmark_id,
        bookId: remote.book_id,
        bookName: remote.book_name,
        chapter: remote.chapter,
        verse: remote.verse,
        textPreview: remote.text_preview || '',
        createdAt: remote.created_at,
      });
    }
  }

  // Upload local bookmarks created since last sync or missing remotely
  const remoteIds = new Set((remoteBookmarks || []).map((r: { bookmark_id: string }) => r.bookmark_id));
  const bookmarksToUpload = localBookmarks
    .filter(local => !remoteIds.has(local.id) && new Date(local.createdAt).getTime() > (getSyncState().lastBookmarksSync || 0))
    .map(local => ({
      user_id: userId,
      bookmark_id: local.id,
      book_id: local.bookId,
      book_name: local.bookName,
      chapter: local.chapter,
      verse: local.verse,
      text_preview: local.textPreview || '',
      created_at: local.createdAt,
      updated_at: new Date().toISOString(),
    }));

  if (bookmarksToUpload.length > 0 && canSync()) {
    await supabase.from('bookmarks').upsert(bookmarksToUpload, { onConflict: 'user_id,bookmark_id' });
  }

  setSyncState({ lastBookmarksSync: Date.now() });
}

// =====================================================
// BIBLE CACHE SYNC
// =====================================================
//
// Supabase table DDL:
//
// CREATE TABLE bible_cache (
//   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
//   cache_key TEXT NOT NULL,          -- e.g. "GEN_1_cuv"
//   book_id TEXT NOT NULL,
//   chapter INTEGER NOT NULL,
//   translation TEXT NOT NULL,
//   data JSONB NOT NULL,              -- ChapterStorageData (verse array)
//   updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
//   UNIQUE(user_id, cache_key)
// );
// CREATE INDEX idx_bible_cache_user ON bible_cache(user_id);
// ALTER TABLE bible_cache ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users can manage own bible cache" ON bible_cache
//   FOR ALL USING (auth.uid() = user_id);
//

async function syncBibleCache(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get all locally cached chapters
  const localChapters = await bibleStorage.getAllChapters();

  // Get remote cache keys only (not full data) for comparison
  const { data: remoteKeys, error } = await supabase
    .from('bible_cache')
    .select('cache_key')
    .eq('user_id', userId);

  if (error) throw error;

  const remoteKeySet = new Set((remoteKeys || []).map((r: { cache_key: string }) => r.cache_key));
  const localKeySet = new Set(localChapters.map(l => `${l.bookId}_${l.chapter}_${l.translation}`));

  // Download remote chapters we don't have locally (fetch data only for missing ones)
  const missingKeys = [...remoteKeySet].filter(k => !localKeySet.has(k));
  if (missingKeys.length > 0) {
    // Fetch in batches of 20 to avoid huge responses
    for (let i = 0; i < missingKeys.length; i += 20) {
      const batch = missingKeys.slice(i, i + 20);
      const { data: remoteChapters } = await supabase
        .from('bible_cache')
        .select('cache_key, book_id, chapter, translation, data')
        .eq('user_id', userId)
        .in('cache_key', batch);

      for (const remote of remoteChapters || []) {
        if (remote.data) {
          await bibleStorage.saveChapter(
            remote.book_id,
            remote.chapter,
            remote.translation as BibleTranslation,
            remote.data
          );
        }
      }
    }
  }

  // Upload local chapters that don't exist remotely — batch upsert
  const chaptersToUpload = localChapters
    .filter(local => !remoteKeySet.has(`${local.bookId}_${local.chapter}_${local.translation}`))
    .map(local => ({
      user_id: userId,
      cache_key: `${local.bookId}_${local.chapter}_${local.translation}`,
      book_id: local.bookId,
      chapter: local.chapter,
      translation: local.translation,
      data: local.data,
      updated_at: new Date().toISOString(),
    }));

  if (chaptersToUpload.length > 0) {
    // Batch in chunks of 5 (chapter JSONB data is large)
    for (let i = 0; i < chaptersToUpload.length; i += 5) {
      if (!canSync()) break;
      const batch = chaptersToUpload.slice(i, i + 5);
      await supabase.from('bible_cache').upsert(batch, { onConflict: 'user_id,cache_key' }).then(({ error }) => {
        if (error) throw error;
      });
    }
  }

  setSyncState({ lastBibleCacheSync: Date.now() });
}

// =====================================================
// JOURNAL SYNC
// =====================================================
// Supabase table DDL: see database/journal-schema-update.sql
// Key fields: id, user_id, title, content, plain_text, drawing,
//   blocks (JSONB), latitude, longitude, location_name, book_id,
//   chapter, verse_ref, tags, created_at, updated_at
// Realtime enabled: ALTER PUBLICATION supabase_realtime ADD TABLE journal;
//
// EGRESS STRATEGY — two-phase fetch (PLAN.md Phase 2):
//   1. Bulk pull (syncJournal) selects ONLY lightweight metadata columns
//      (JOURNAL_LIST_COLUMNS). Heavy columns (`blocks`, `notability_data`,
//      `drawing`, `content`) are NOT downloaded here. This keeps the
//      periodic sync cheap: a typical journal row list is ~1KB vs ~200KB+
//      when `notability_data` is present.
//   2. Lazy pull (fetchJournalEntryBody) is called when the user opens
//      an entry in JournalView. It fetches the heavy columns for one row
//      and merges them into local IDB.
//
// Critical string constants — R3. Changing these requires updating every
// consumer below AND the column list in database/journal-schema-update.sql.

/** Metadata columns — cheap to fetch, used for journal list rendering. */
export const JOURNAL_LIST_COLUMNS =
  'id,user_id,title,plain_text,latitude,longitude,location_name,book_id,chapter,verse_ref,tags,created_at,updated_at';

/** Heavy body columns — only fetched when an entry is opened. */
export const JOURNAL_BODY_COLUMNS =
  'id,content,blocks,notability_data,drawing,updated_at';

/**
 * Map a remote journal row (snake_case) to a local JournalEntry (camelCase).
 * Shared by syncJournal() and the direct Realtime listener.
 */
function remoteToLocalJournal(remote: any): import('./idbService').JournalEntry {
  return {
    id: remote.id,
    title: remote.title || '',
    content: remote.content || '',
    plainText: remote.plain_text || '',
    drawing: remote.drawing || '',
    blocks: remote.blocks || undefined,
    notabilityData: remote.notability_data || undefined,
    latitude: remote.latitude,
    longitude: remote.longitude,
    locationName: remote.location_name,
    bookId: remote.book_id,
    chapter: remote.chapter,
    verseRef: remote.verse_ref,
    tags: remote.tags || [],
    createdAt: remote.created_at,
    updatedAt: remote.updated_at,
  };
}

/**
 * Map a local JournalEntry to a Supabase row for upload.
 * Image sync strategy: Option A — base64 data URLs stored directly in blocks JSONB.
 * Future enhancement (Option B): upload large images to Supabase Storage bucket
 * and store storage URLs in blocks instead of base64, using the journal_media table.
 */
function localToRemoteJournal(e: import('./idbService').JournalEntry, userId: string): Record<string, any> {
  const drawing = (e as any).drawing || '';
  return {
    id: e.id,
    user_id: userId,
    title: e.title,
    content: e.content,
    plain_text: e.plainText,
    drawing: drawing.length > 512000 ? '' : drawing,
    blocks: e.blocks || [],
    notability_data: e.notabilityData || null,
    latitude: e.latitude || null,
    longitude: e.longitude || null,
    location_name: e.locationName || null,
    book_id: e.bookId || null,
    chapter: e.chapter || null,
    verse_ref: e.verseRef || null,
    tags: e.tags || [],
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

async function syncJournal(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  const { journalStorage } = await import('./journalStorage');

  const syncState = getSyncState();
  const lastSyncISO = new Date(syncState.lastJournalSync).toISOString();

  console.log(`[sync] journal pull start — cutoff=${lastSyncISO}`);

  // Quick check: count remote changes before fetching any rows
  const { count: remoteCount } = await supabase
    .from('journal')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('updated_at', lastSyncISO);

  // Check if any local entries were modified since last sync
  const allLocal = await journalStorage.getAllEntries();
  const localChanged = allLocal.filter(e => new Date(e.updatedAt).getTime() > syncState.lastJournalSync);

  // Nothing to sync — early exit
  if (!remoteCount && localChanged.length === 0) {
    console.log('[sync] journal pull end — no changes');
    setSyncState({ lastJournalSync: Date.now() });
    return;
  }

  // EGRESS FIX: fetch only lightweight metadata columns here.
  // Heavy columns (blocks, notability_data, drawing, content) are
  // fetched lazily per-entry via fetchJournalEntryBody() when opened.
  // See JOURNAL_LIST_COLUMNS comment for rationale.
  let remoteEntries: any[] = [];
  if (remoteCount && remoteCount > 0) {
    const { data, error } = await supabase
      .from('journal')
      .select(JOURNAL_LIST_COLUMNS)
      .eq('user_id', userId)
      .gte('updated_at', lastSyncISO);
    if (error) {
      console.error('[sync] journal pull failed:', error.message);
      throw error;
    }
    remoteEntries = data || [];
    console.log(`[sync] journal pull end — rows=${remoteEntries.length} (metadata-only)`);
  } else {
    console.log('[sync] journal pull end — no remote changes');
  }

  // Merge remote metadata into local IDB (last-write-wins: remote wins on tie-break by >).
  // CROSS-DEVICE FIX: preserve the REMOTE updated_at timestamp — previously
  // journalStorage.updateEntry() bumped updatedAt to Date.now() on the
  // receiving device, which made the just-synced row look locally-changed
  // and triggered a redundant re-upload (and could clobber a newer write
  // from a third device). We now go through idbService.put directly to
  // write the exact remote timestamp, and preserve local-only heavy fields
  // (blocks / notability_data) so that lazy-fetch can fill them in.
  const { idbService } = await import('./idbService');
  for (const remote of remoteEntries) {
    const local = await journalStorage.getEntry(remote.id);
    const remoteTs = new Date(remote.updated_at).getTime();
    if (!local || remoteTs > new Date(local.updatedAt).getTime()) {
      const meta = remoteToLocalJournal(remote);
      await idbService.put('journal', {
        ...(local || {}),
        id: remote.id,
        title: meta.title,
        plainText: meta.plainText,
        latitude: meta.latitude,
        longitude: meta.longitude,
        locationName: meta.locationName,
        bookId: meta.bookId,
        chapter: meta.chapter,
        verseRef: meta.verseRef,
        tags: meta.tags,
        createdAt: local?.createdAt || meta.createdAt,
        updatedAt: meta.updatedAt, // preserve remote timestamp
        // Heavy fields: keep local copy if present; lazy-fetch will refresh
        // them when the user opens the entry. New entries will have these
        // undefined until lazy-fetch runs.
        content: local?.content ?? '',
        blocks: local?.blocks,
        notabilityData: local?.notabilityData,
        drawing: local?.drawing,
      });
    }
  }

  // Notify UI if remote changes were merged
  if (remoteEntries.length > 0) {
    window.dispatchEvent(new CustomEvent('journal-synced'));
  }

  // Upload local entries modified since last sync
  const toUpload = localChanged.filter(local =>
    new Date(local.updatedAt).getTime() > syncState.lastJournalSync
  );
  if (toUpload.length > 0) {
    console.log(`[sync] journal push start — rows=${toUpload.length}`);
    const rows = toUpload.map(e => localToRemoteJournal(e, userId));
    let lastUpsertError: { message: string } | null = null;

    for (let i = 0; i < rows.length; i += 50) {
      if (!canSync()) break;
      const batch = rows.slice(i, i + 50);
      const { error: upsertError } = await supabase.from('journal').upsert(batch, { onConflict: 'id' });
      if (upsertError) {
        console.error('[sync] journal push batch failed:', upsertError.message);
        lastUpsertError = upsertError;
      }
    }

    // Only advance sync timestamp if upload succeeded — failed entries will be retried next cycle.
    // ADR-0001 Bug 2 fix: previously this returned silently on partial failure, which hid
    // the error from performFullSync's per-step surface. Now we throw so the caller's catch
    // logs `[sync]` and sets syncManager status to `error`. This is the same instance of R5
    // silent-swallow the ADR flagged alongside L1133 — identical family, same subsystem.
    if (lastUpsertError) {
      console.warn('[sync] journal push partial failure — not advancing lastJournalSync');
      throw new Error(`journal push failed: ${lastUpsertError.message}`);
    }
    console.log(`[sync] journal push end — rows=${rows.length}`);
  }

  setSyncState({ lastJournalSync: Date.now() });
}

/**
 * Lazy-fetch the heavy body columns (blocks, notability_data, drawing,
 * content) for a single journal entry. Called from JournalView when the
 * user opens an entry whose body we haven't downloaded yet (or whose
 * remote version is newer than our local cache).
 *
 * Egress model: this replaces the old behavior where every periodic sync
 * pulled all heavy columns for every changed entry. Now they are only
 * pulled when the user actually opens the entry on this device.
 *
 * Safe to call repeatedly — if the local copy is already at or past the
 * remote updated_at, this is a noop after one cheap metadata comparison.
 */
export async function fetchJournalEntryBody(id: string): Promise<void> {
  if (!supabase || !canSync()) return;
  const userId = authManager.getUserId();
  if (!userId) return;

  const { journalStorage } = await import('./journalStorage');
  const { idbService } = await import('./idbService');
  const local = await journalStorage.getEntry(id);

  console.log(`[sync] journal lazy-fetch start — id=${id}`);
  const { data: remote, error } = await supabase
    .from('journal')
    .select(JOURNAL_BODY_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error(`[sync] journal lazy-fetch failed — id=${id}:`, error.message);
    return;
  }
  if (!remote) {
    console.log(`[sync] journal lazy-fetch end — id=${id} not found on remote`);
    return;
  }

  // Last-write-wins: only overwrite local body if remote is newer.
  const remoteTs = new Date(remote.updated_at).getTime();
  const localTs = local ? new Date(local.updatedAt).getTime() : 0;
  if (local && remoteTs <= localTs && local.blocks !== undefined) {
    console.log(`[sync] journal lazy-fetch end — id=${id} local is current`);
    return;
  }

  await idbService.put('journal', {
    ...(local || {
      id,
      title: '',
      plainText: '',
      tags: [],
      createdAt: new Date(remote.updated_at).toISOString(),
    }),
    id,
    content: remote.content || '',
    blocks: remote.blocks || undefined,
    notabilityData: remote.notability_data || undefined,
    drawing: remote.drawing || '',
    updatedAt: remote.updated_at,
  });

  console.log(`[sync] journal lazy-fetch end — id=${id} body merged`);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('journal-synced'));
  }
}

// =====================================================
// CHAT HISTORY SYNC
// =====================================================
// Supabase DDL:
// CREATE TABLE chat_history (
//   id TEXT NOT NULL,
//   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//   book_id TEXT NOT NULL,
//   chapter INTEGER NOT NULL,
//   messages JSONB NOT NULL DEFAULT '[]',
//   last_modified BIGINT NOT NULL,
//   updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
//   PRIMARY KEY (user_id, id)
// );
// CREATE INDEX idx_chat_history_user ON chat_history(user_id);
// ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users can manage own chat history" ON chat_history FOR ALL USING (auth.uid() = user_id);

async function syncChatHistory(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  const { idbService } = await import('./idbService');

  const syncState = getSyncState();
  const { data: remoteRecords, error } = await supabase
    .from('chat_history')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', new Date(syncState.lastChatHistorySync).toISOString());

  if (error) throw error;

  // Merge remote into local (remote wins on conflict)
  for (const remote of remoteRecords || []) {
    const local = await idbService.get('chatHistory', remote.id);
    if (!local || remote.last_modified > local.lastModified) {
      await idbService.put('chatHistory', {
        id: remote.id,
        title: remote.title || '',
        bookId: remote.book_id || undefined,
        chapter: remote.chapter || undefined,
        messages: remote.messages || [],
        createdAt: remote.created_at || new Date(remote.last_modified).toISOString(),
        lastModified: remote.last_modified,
      });
    }
  }

  // Upload local records modified since last sync
  const allLocal = await idbService.getAll('chatHistory');
  const toUpload = allLocal.filter(local =>
    (local.lastModified || 0) > syncState.lastChatHistorySync
  );

  if (toUpload.length > 0) {
    const rows = toUpload.map(e => ({
      id: e.id,
      user_id: userId,
      title: e.title || '',
      book_id: e.bookId || '',
      chapter: e.chapter || 0,
      messages: e.messages,
      created_at: e.createdAt || new Date(e.lastModified).toISOString(),
      last_modified: e.lastModified,
      updated_at: new Date(e.lastModified).toISOString(),
    }));

    for (let i = 0; i < rows.length; i += 50) {
      if (!canSync()) break;
      await supabase.from('chat_history').upsert(rows.slice(i, i + 50), { onConflict: 'user_id,id' });
    }
  }

  setSyncState({ lastChatHistorySync: Date.now() });
}

// =====================================================
// SPIRITUAL MEMORY SYNC
// =====================================================

async function syncSpiritualMemory(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  const { spiritualMemory } = await import('./spiritualMemory');

  const syncState = getSyncState();
  const lastSyncISO = new Date(syncState.lastSpiritualMemorySync).toISOString();

  // Quick count check
  const { count: remoteCount } = await supabase
    .from('spiritual_memory')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('updated_at', lastSyncISO);

  const allLocal = await spiritualMemory.getAllItems();
  const localChanged = allLocal.filter(item =>
    new Date(item.updatedAt).getTime() > syncState.lastSpiritualMemorySync
  );

  // Early exit if nothing changed
  if (!remoteCount && localChanged.length === 0) {
    setSyncState({ lastSpiritualMemorySync: Date.now() });
    return;
  }

  // Pull remote changes
  if (remoteCount && remoteCount > 0) {
    const { data: remoteItems, error } = await supabase
      .from('spiritual_memory')
      .select('*')
      .eq('user_id', userId)
      .gte('updated_at', lastSyncISO);

    if (error) throw error;

    const { idbService } = await import('./idbService');
    for (const remote of remoteItems || []) {
      const local = await spiritualMemory.getItem(remote.id);
      if (!local || new Date(remote.updated_at).getTime() > new Date(local.updatedAt).getTime()) {
        await idbService.put('spiritualMemory', {
          id: remote.id,
          category: remote.category,
          content: remote.content,
          source: remote.source || undefined,
          createdAt: remote.created_at,
          updatedAt: remote.updated_at,
        });
      }
    }
  }

  // Push local changes
  if (localChanged.length > 0) {
    const rows = localChanged.map(item => ({
      id: item.id,
      user_id: userId,
      category: item.category,
      content: item.content,
      source: item.source || null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    }));

    for (let i = 0; i < rows.length; i += 50) {
      if (!canSync()) break;
      await supabase.from('spiritual_memory').upsert(rows.slice(i, i + 50), { onConflict: 'id' });
    }
  }

  setSyncState({ lastSpiritualMemorySync: Date.now() });
}

// =====================================================
// FULL SYNC
// =====================================================

export async function performFullSync(): Promise<void> {
  if (!canSync()) {
    return;
  }

  // Concurrency guard: skip if another sync is already running
  if (!await acquireSyncMutex()) {
    console.warn('[Sync] Full sync skipped — another sync is already running');
    return;
  }

  try {
    const steps: Array<{ name: string; fn: () => Promise<void> }> = [
      { name: 'Notes', fn: syncNotes },
      { name: 'Annotations', fn: syncAnnotations },
      { name: 'Reading History', fn: syncReadingHistory },
      { name: 'Settings', fn: () => syncSettings(true) }, // force pull from remote on full sync
      { name: 'Verse Data', fn: syncVerseData },
      { name: 'Bookmarks', fn: syncBookmarks },
      { name: 'Bible Cache', fn: syncBibleCache },
      { name: 'Journal', fn: syncJournal },
      { name: 'Chat History', fn: syncChatHistory },
      { name: 'Spiritual Memory', fn: syncSpiritualMemory },
    ];

    syncManager.resetCancelled();
    syncManager.startSync(steps.length);

    const withTimeout = (fn: () => Promise<void>, ms = 15000) =>
      Promise.race([fn(), new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

    // ADR-0001 Bug 2 fix: do NOT silently swallow per-step failures. Previously
    // this catch was `catch {}` with a comment ("doesn't block others"). That
    // meant a failing notes/journal/annotations push left the user with a
    // green "synced" indicator while data silently failed to upload — which
    // per the architecture review is a likely contributor to the egress
    // mystery (users retry syncs that look fine). R5: surface it.
    //
    // Contract: every failure gets a `[sync]` console.error AND advances the
    // syncManager status to 'error' with the reason. We still continue to
    // the next step (partial progress is better than none on a long sync),
    // but the status is correctly `error` at the end if any step failed.
    const stepFailures: Array<{ name: string; message: string }> = [];
    for (const step of steps) {
      if (syncManager.isCancelled() || !canSync()) break;
      syncManager.stepStart(step.name);
      try {
        await withTimeout(step.fn);
      } catch (stepErr) {
        const message = stepErr instanceof Error ? stepErr.message : String(stepErr);
        stepFailures.push({ name: step.name, message });
        // Greppable `[sync]` prefix — matches PR #11's instrumentation convention
        // used elsewhere in this file (reading_history / journal / bookmarks logs).
        console.error(`[sync] step "${step.name}" failed:`, message, stepErr);
        // Surface to the sync-status store immediately so JournalView / the
        // status pill see the failure as it happens, not only at the end.
        syncManager.setStatus('error', `${step.name}: ${message}`);
      }
      syncManager.stepDone(step.name);
    }

    // Update all module timestamps after full sync
    const ts = Date.now();
    for (const m of ALL_MODULES) setLocalTimestamp(m, ts);
    if (supabase && canSync()) {
      const userId = authManager.getUserId();
      if (userId) {
        const rows = ALL_MODULES.map(m => ({
          user_id: userId, module: m, last_modified: ts, updated_at: new Date(ts).toISOString(),
        }));
        // Non-critical: this is telemetry metadata (server-side "last seen"
        // counters) used as a coarse incremental-sync hint. If it fails the
        // next incremental pass falls back to the local timestamps, so a
        // single failure here is recoverable. We still log it so it's not
        // invisible (R5 — "silent" requires an explicit reason).
        try {
          await supabase.from('sync_metadata').upsert(rows, { onConflict: 'user_id,module' });
        } catch (metaErr) {
          console.error('[sync] sync_metadata upsert failed (non-critical, next incremental pass will self-heal):',
            metaErr instanceof Error ? metaErr.message : String(metaErr));
        }
      }
    }

    // Only claim idle if every step actually succeeded. If any step failed,
    // leave the 'error' status on the manager so the UI keeps surfacing it.
    if (stepFailures.length === 0) {
      syncManager.setStatus('idle');
    }
  } catch (error) {
    syncManager.setStatus('error', error instanceof Error ? error.message : 'Sync failed');
    throw error;
  } finally {
    releaseSyncMutex();
  }
}

// =====================================================
// INCREMENTAL SYNC (timestamp-based, only changed modules)
// =====================================================

const MODULE_SYNC_MAP: Record<SyncModule, { name: string; fn: () => Promise<void> }> = {
  notes:          { name: 'Notes', fn: syncNotes },
  annotations:    { name: 'Annotations', fn: syncAnnotations },
  readingHistory: { name: 'Reading History', fn: syncReadingHistory },
  settings:       { name: 'Settings', fn: syncSettings },
  verseData:      { name: 'Verse Data', fn: syncVerseData },
  bookmarks:      { name: 'Bookmarks', fn: syncBookmarks },
  bibleCache:     { name: 'Bible Cache', fn: syncBibleCache }, // disabled in ALL_MODULES but kept in map for manual use
  journal:        { name: 'Journal', fn: syncJournal },
  chatHistory:    { name: 'Chat History', fn: syncChatHistory },
  spiritualMemory: { name: 'Spiritual Memory', fn: syncSpiritualMemory },
};

export async function performIncrementalSync(): Promise<void> {
  if (!canSync() || isSyncThrottled()) return;

  // Concurrency guard: skip if another sync is already running
  if (!await acquireSyncMutex()) {
    return; // silently skip — incremental syncs are frequent, no need to warn
  }

  try {
    // Fetch server timestamps (one lightweight query)
    const serverTs = await fetchServerTimestamps();
    const localTs = getLocalTimestamps();

    // Find modules where server is newer than local
    const stale: SyncModule[] = ALL_MODULES.filter(m =>
      (serverTs[m] || 0) > (localTs[m] || 0)
    );

    if (stale.length === 0) return; // Nothing to sync

    const steps = stale.map(m => ({ ...MODULE_SYNC_MAP[m], module: m }));

    syncManager.resetCancelled();
    syncManager.startSync(steps.length);

    const withTimeout = (fn: () => Promise<void>, ms = 15000) =>
      Promise.race([fn(), new Promise<void>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

    for (const step of steps) {
      if (syncManager.isCancelled() || !canSync() || isSyncThrottled()) break;
      syncManager.stepStart(step.name);
      try {
        await withTimeout(step.fn);
        setLocalTimestamp(step.module, serverTs[step.module] || Date.now());
        resetSyncBackoff();
      } catch (err) {
        handleSyncError(err);
        if (isSyncThrottled()) break; // stop processing remaining modules
      }
      syncManager.stepDone(step.name);
    }

    syncManager.setStatus('idle');
  } catch (error) {
    handleSyncError(error);
    syncManager.setStatus('error', error instanceof Error ? error.message : 'Sync failed');
  } finally {
    releaseSyncMutex();
  }
}

// =====================================================
// AUTO SYNC ON AUTH STATE CHANGE (full sync on login)
// =====================================================

authManager.subscribe(async (state) => {
  if (state.isAuthenticated && !state.isLoading) {
    try {
      await performIncrementalSync();
    } catch {
      // silently handle
    }
  }
});

// =====================================================
// PERIODIC SYNC (every 5 minutes — incremental only)
// =====================================================

let lastSyncAttempt = 0;
let periodicSyncIntervalId: ReturnType<typeof setInterval> | null = null;

function startPeriodicSync(): void {
  stopPeriodicSync(); // clear any existing interval first
  periodicSyncIntervalId = setInterval(() => {
    if (canSync() && syncManager.getStatus() === 'idle') {
      lastSyncAttempt = Date.now();
      performIncrementalSync().catch((err) => console.warn('[Sync]', err));
    }
  }, 300 * 1000); // 5 minutes
}

function stopPeriodicSync(): void {
  if (periodicSyncIntervalId !== null) {
    clearInterval(periodicSyncIntervalId);
    periodicSyncIntervalId = null;
  }
}

if (typeof window !== 'undefined') {
  startPeriodicSync();
}

// =====================================================
// SYNC ON TAB VISIBILITY (incremental — timestamp check)
// =====================================================

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && canSync() && syncManager.getStatus() === 'idle') {
      // Skip if less than 60 seconds since last sync attempt
      if (Date.now() - lastSyncAttempt < 60_000) return;
      lastSyncAttempt = Date.now();
      performIncrementalSync().catch((err) => console.warn('[Sync]', err));
    }
  });
}

// =====================================================
// BACKGROUND PUSH ON LOCAL CHANGES (per-module, debounced)
// =====================================================

const pushTimers: Partial<Record<SyncModule, ReturnType<typeof setTimeout>>> = {};

function schedulePush(module: SyncModule, immediate = false) {
  if (!canSync() || isSyncThrottled()) return;
  if (pushTimers[module]) clearTimeout(pushTimers[module]);
  const run = async () => {
    if (!canSync() || isSyncThrottled()) return;
    try {
      await MODULE_SYNC_MAP[module].fn();
      stampModule(module);
      resetSyncBackoff();
    } catch (err) {
      handleSyncError(err);
    }
  };
  if (immediate) {
    run();
  } else {
    pushTimers[module] = setTimeout(run, 5000);
  }
}

if (typeof window !== 'undefined') {
  const eventToModule: Record<string, SyncModule> = {
    'versedata-updated': 'verseData',
    'annotation-updated': 'annotations',
    'chathistory-updated': 'chatHistory',
    'bookmark-updated': 'bookmarks',
    // 'bible-cache-updated': 'bibleCache', — disabled to reduce Disk IO
    'notes-updated': 'notes',
    'journal-updated': 'journal',
    'readinghistory-updated': 'readingHistory',
    'settings-updated': 'settings',
    'spiritualmemory-updated': 'spiritualMemory',
  };
  for (const [event, module] of Object.entries(eventToModule)) {
    window.addEventListener(event, () => schedulePush(module));
  }
  // Immediate sync events — bypass debounce for deliberate user actions (e.g. "Save to note")
  for (const [event, module] of Object.entries(eventToModule)) {
    window.addEventListener(`${event}-now`, () => schedulePush(module, true));
  }
}

// =====================================================
// REALTIME SYNC (instant cross-device updates)
// =====================================================
//
// AUDIT (PLAN.md Phase 2): only one Realtime channel is active in
// production — `sync-realtime`, subscribed to the `sync_metadata` table.
// It is KEPT because it is how a secondary device discovers that the
// primary device pushed a change: the server updates sync_metadata,
// Realtime delivers a notification within seconds, and the secondary
// device pulls only the modules whose timestamps advanced. Without this,
// cross-device sync would depend on the 5-min periodic poll (or manual
// sync). That's unacceptable latency for "I wrote a journal entry on
// my phone, now I open the iPad".
//
// sync_metadata is a tiny table (one row per module per user, ~10 rows),
// so the realtime egress cost is trivial — a few KB/day even under
// heavy write load.
//
// The per-table `journal-realtime` channel (setupJournalRealtimeSync
// below) is INTENTIONALLY NOT subscribed — journal body changes can be
// large (blocks/notability JSONB), and waking the realtime pipe for
// each drawing stroke push would dwarf the egress budget. Journal syncs
// piggy-back on the sync_metadata notification above plus lazy body
// fetch (fetchJournalEntryBody) when the user opens an entry.

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function setupRealtimeSync(): void {
  if (!supabase || !canSync()) return;
  const userId = authManager.getUserId();
  if (!userId) return;

  // Clean up existing subscription
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = supabase.channel('sync-realtime')
    .on(
      'postgres_changes' as any,
      { event: '*', schema: 'public', table: 'sync_metadata', filter: `user_id=eq.${userId}` },
      (payload: any) => {
        const row = payload.new;
        if (!row?.module) return;

        const module = row.module as SyncModule;
        const serverTs = row.last_modified || 0;
        const localTs = getLocalTimestamps()[module] || 0;

        // Only pull if server is newer than local (another device pushed)
        if (serverTs > localTs && MODULE_SYNC_MAP[module]) {
          console.log(`[sync] realtime trigger — module=${module} serverTs=${serverTs}`);
          MODULE_SYNC_MAP[module].fn()
            .then(() => {
              setLocalTimestamp(module, serverTs);
              // Notify UI to re-read from IDB
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event(`${module}-synced`));
              }
            })
            .catch((err) => console.warn('[sync] realtime pull failed:', err));
        }
      }
    )
    .subscribe();
  console.log('[sync] realtime subscribed — table=sync_metadata');
}

// =====================================================
// DIRECT REALTIME: journal table (DISABLED — see audit above)
// =====================================================
// The code below is preserved (and still tested) so the feature can be
// re-enabled quickly if we decide the latency tradeoff flips. As of
// 2026-04-21 it is intentionally not subscribed to save egress.

let journalRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function setupJournalRealtimeSync(): void {
  if (!supabase || !canSync()) return;
  const userId = authManager.getUserId();
  if (!userId) return;

  // Clean up existing subscription
  if (journalRealtimeChannel) {
    supabase.removeChannel(journalRealtimeChannel);
    journalRealtimeChannel = null;
  }

  journalRealtimeChannel = supabase.channel('journal-realtime')
    .on(
      'postgres_changes' as any,
      { event: 'INSERT', schema: 'public', table: 'journal', filter: `user_id=eq.${userId}` },
      (payload: any) => handleJournalRealtimeChange(payload)
    )
    .on(
      'postgres_changes' as any,
      { event: 'UPDATE', schema: 'public', table: 'journal', filter: `user_id=eq.${userId}` },
      (payload: any) => handleJournalRealtimeChange(payload)
    )
    .on(
      'postgres_changes' as any,
      { event: 'DELETE', schema: 'public', table: 'journal', filter: `user_id=eq.${userId}` },
      async (payload: any) => {
        const oldId = payload.old?.id;
        if (!oldId) return;
        try {
          const { journalStorage } = await import('./journalStorage');
          await journalStorage.deleteEntry(oldId);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('journal-synced'));
          }
        } catch {}
      }
    )
    .subscribe();
}

async function handleJournalRealtimeChange(payload: any): Promise<void> {
  const remote = payload.new;
  if (!remote?.id) return;

  try {
    const { journalStorage } = await import('./journalStorage');
    const { idbService } = await import('./idbService');
    const local = await journalStorage.getEntry(remote.id);

    // Last-write-wins: only apply if remote is newer
    if (!local || new Date(remote.updated_at).getTime() > new Date(local.updatedAt).getTime()) {
      const mapped = remoteToLocalJournal(remote);
      if (local) {
        // Use idbService.put directly to avoid dispatching journal-updated
        // (which would trigger a push back to server — ping-pong loop)
        await idbService.put('journal', { ...mapped, createdAt: local.createdAt });
      } else {
        await idbService.put('journal', mapped);
      }

      // Notify UI to refresh (distinct from journal-updated which triggers push)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('journal-synced'));
      }
    }
  } catch {}
}

// Set up Realtime when user logs in
authManager.subscribe((state) => {
  if (state.isAuthenticated && !state.isLoading) {
    // Delay to let initial sync finish first
    setTimeout(() => {
      setupRealtimeSync();
      // setupJournalRealtimeSync(); — disabled to reduce Disk IO (journal syncs via periodic + event push)
    }, 10000);
  } else if (!state.isAuthenticated && supabase) {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
    if (journalRealtimeChannel) {
      supabase.removeChannel(journalRealtimeChannel);
      journalRealtimeChannel = null;
    }
  }
});

// =====================================================
// EXPORT
// =====================================================

// Exported for testing
export { remoteToLocalJournal, localToRemoteJournal, handleJournalRealtimeChange };

export const syncService = {
  performFullSync,
  performIncrementalSync,
  notifySettingsChanged,
  syncNotes,
  syncAnnotations,
  syncReadingHistory,
  syncSettings,
  syncVerseData,
  syncBookmarks,
  syncBibleCache,
  syncJournal,
  fetchJournalEntryBody,
  syncChatHistory,
  syncSpiritualMemory,
  canSync,
  getSyncState,
  startPeriodicSync,
  stopPeriodicSync,
  /** Test helpers — not for production use */
  _isSyncLocked: () => syncMutexLocked,
  _resetMutex: () => { syncMutexLocked = false; syncMutexQueue = []; },
};
