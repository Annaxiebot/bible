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
  'verseData', 'bookmarks', 'bibleCache', 'journal', 'chatHistory',
  'spiritualMemory',
];

const MODULE_TS_KEY = 'bible_sync_module_timestamps';

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
  if (!supabase || !canSync()) return {};
  const userId = authManager.getUserId();
  if (!userId) return {};
  const { data } = await supabase
    .from('sync_metadata')
    .select('module, last_modified')
    .eq('user_id', userId);
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

async function syncNotes(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get local notes
  const localNotes = await notesStorage.getAllNotes();
  
  // Get remote notes modified since last sync
  const syncState = getSyncState();
  const { data: remoteNotes, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', new Date(syncState.lastNotesSync).toISOString());

  if (error) {
    // TODO: use error reporting service
    throw error;
  }

  // Merge remote notes into local (remote wins on conflict)
  for (const remoteNote of remoteNotes || []) {
    await notesStorage.saveNote(remoteNote.reference, remoteNote.content);
  }

  // Upload local notes that don't exist remotely — batch upsert
  const notesToUpload = Object.entries(localNotes)
    .filter(([reference]) => !remoteNotes?.find(n => n.reference === reference))
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
    await supabase.from('notes').upsert(notesToUpload, { onConflict: 'user_id,reference' });
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

  // Get remote history
  const { data: remoteHistory, error: historyError } = await supabase
    .from('reading_history')
    .select('*')
    .eq('user_id', userId);

  if (historyError) {
    // TODO: use error reporting service
    throw historyError;
  }

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

  // Upload local history to remote — batch upsert
  const historyToUpload = localHistory.map(local => ({
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
  STORAGE_KEYS.CHINESE_MODE,
  STORAGE_KEYS.FONT_SIZE,
  STORAGE_KEYS.VIEW_LAYOUT,
  'useFreeRouter',
  'useServerAI',
  'autoRaceAI',
  'webSearchProvider',
];

async function syncSettings(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  // Get remote settings
  const { data: remote } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

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

    if (remoteTime > syncState.lastSettingsSync) {
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

  // Get all remote bookmarks
  const { data: remoteBookmarks, error } = await supabase
    .from('bookmarks')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;

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

  // Quick check: count remote changes before fetching full rows
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
    setSyncState({ lastJournalSync: Date.now() });
    return;
  }

  // Fetch full remote rows only if there are changes
  let remoteEntries: any[] = [];
  if (remoteCount && remoteCount > 0) {
    const { data, error } = await supabase
      .from('journal')
      .select('*')
      .eq('user_id', userId)
      .gte('updated_at', lastSyncISO);
    if (error) throw error;
    remoteEntries = data || [];
  }

  // Merge remote into local (last-write-wins: remote wins on conflict)
  for (const remote of remoteEntries) {
    const local = await journalStorage.getEntry(remote.id);
    if (!local || new Date(remote.updated_at).getTime() > new Date(local.updatedAt).getTime()) {
      const mapped = remoteToLocalJournal(remote);
      if (local) {
        await journalStorage.updateEntry(remote.id, {
          title: mapped.title,
          content: mapped.content,
          plainText: mapped.plainText,
          drawing: mapped.drawing,
          blocks: mapped.blocks,
          latitude: mapped.latitude,
          longitude: mapped.longitude,
          locationName: mapped.locationName,
          bookId: mapped.bookId,
          chapter: mapped.chapter,
          verseRef: mapped.verseRef,
          tags: mapped.tags,
        });
      } else {
        const { idbService } = await import('./idbService');
        await idbService.put('journal', mapped);
      }
    }
  }

  // Upload local entries modified since last sync
  const toUpload = localChanged.filter(local =>
    new Date(local.updatedAt).getTime() > syncState.lastJournalSync
  );

  if (toUpload.length > 0) {
    const rows = toUpload.map(e => localToRemoteJournal(e, userId));

    for (let i = 0; i < rows.length; i += 50) {
      if (!canSync()) break;
      await supabase.from('journal').upsert(rows.slice(i, i + 50), { onConflict: 'id' });
    }
  }

  setSyncState({ lastJournalSync: Date.now() });
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

  try {
    const steps: Array<{ name: string; fn: () => Promise<void> }> = [
      { name: 'Notes', fn: syncNotes },
      { name: 'Annotations', fn: syncAnnotations },
      { name: 'Reading History', fn: syncReadingHistory },
      { name: 'Settings', fn: syncSettings },
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

    for (const step of steps) {
      if (syncManager.isCancelled() || !canSync()) break;
      syncManager.stepStart(step.name);
      try {
        await withTimeout(step.fn);
      } catch {
        // Individual step failure or timeout doesn't block others
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
        try { await supabase.from('sync_metadata').upsert(rows, { onConflict: 'user_id,module' }); } catch {}
      }
    }

    syncManager.setStatus('idle');
  } catch (error) {
    syncManager.setStatus('error', error instanceof Error ? error.message : 'Sync failed');
    throw error;
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
  bibleCache:     { name: 'Bible Cache', fn: syncBibleCache },
  journal:        { name: 'Journal', fn: syncJournal },
  chatHistory:    { name: 'Chat History', fn: syncChatHistory },
  spiritualMemory: { name: 'Spiritual Memory', fn: syncSpiritualMemory },
};

export async function performIncrementalSync(): Promise<void> {
  if (!canSync()) return;

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
      if (syncManager.isCancelled() || !canSync()) break;
      syncManager.stepStart(step.name);
      try {
        await withTimeout(step.fn);
        // After successful download, update local timestamp to match server
        setLocalTimestamp(step.module, serverTs[step.module] || Date.now());
      } catch {
        // Failed modules will retry on next cycle
      }
      syncManager.stepDone(step.name);
    }

    syncManager.setStatus('idle');
  } catch (error) {
    syncManager.setStatus('error', error instanceof Error ? error.message : 'Sync failed');
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
// PERIODIC SYNC (every 1 minute — incremental only)
// =====================================================

if (typeof window !== 'undefined') {
  setInterval(() => {
    if (canSync() && syncManager.getStatus() === 'idle') {
      performIncrementalSync().catch(() => {});
    }
  }, 60 * 1000);
}

// =====================================================
// SYNC ON TAB VISIBILITY (incremental — timestamp check)
// =====================================================

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && canSync() && syncManager.getStatus() === 'idle') {
      performIncrementalSync().catch(() => {});
    }
  });
}

// =====================================================
// BACKGROUND PUSH ON LOCAL CHANGES (per-module, debounced)
// =====================================================

const pushTimers: Partial<Record<SyncModule, ReturnType<typeof setTimeout>>> = {};

function schedulePush(module: SyncModule, immediate = false) {
  if (!canSync()) return;
  if (pushTimers[module]) clearTimeout(pushTimers[module]);
  const run = async () => {
    if (!canSync()) return;
    try {
      // Run the module's sync function (uploads local changes)
      await MODULE_SYNC_MAP[module].fn();
      // Stamp the module timestamp locally and on server
      stampModule(module);
    } catch { /* silently handle */ }
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
    'bible-cache-updated': 'bibleCache',
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
          MODULE_SYNC_MAP[module].fn()
            .then(() => {
              setLocalTimestamp(module, serverTs);
              // Notify UI to re-read from IDB
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event(`${module}-synced`));
              }
            })
            .catch(() => {});
        }
      }
    )
    .subscribe();
}

// =====================================================
// DIRECT REALTIME: journal table (instant cross-device block sync)
// =====================================================
// Listens directly on the journal table for INSERT/UPDATE events
// from the current user. This gives sub-second updates for blocks
// (text, drawing, image) without waiting for the sync_metadata round-trip.

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
      setupJournalRealtimeSync();
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
  syncChatHistory,
  syncSpiritualMemory,
  canSync,
  getSyncState,
};
