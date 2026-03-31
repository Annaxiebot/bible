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

  if (notesToUpload.length > 0) {
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

  if (annotationsToUpload.length > 0) {
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

  if (historyToUpload.length > 0) {
    await supabase.from('reading_history').upsert(historyToUpload, { onConflict: 'user_id,book_id,chapter' });
  }

  // Sync last read position
  if (lastRead) {
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
  STORAGE_KEYS.AUTO_SAVE_RESEARCH,
  STORAGE_KEYS.ENGLISH_VERSION,
  STORAGE_KEYS.CHINESE_MODE,
  STORAGE_KEYS.FONT_SIZE,
  STORAGE_KEYS.VIEW_LAYOUT,
  'useFreeRouter',
  'useServerAI',
  'autoRaceAI',
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

  // Upload local verse data that is newer or doesn't exist remotely
  const remoteIds = new Set((remoteRows || []).map((r: { verse_id: string }) => r.verse_id));
  const dataToUpload = localData
    .filter(local => !remoteIds.has(local.id))
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

  // Upload local bookmarks to remote — batch upsert
  const remoteIds = new Set((remoteBookmarks || []).map((r: { bookmark_id: string }) => r.bookmark_id));
  const bookmarksToUpload = localBookmarks
    .filter(local => !remoteIds.has(local.id))
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

  if (bookmarksToUpload.length > 0) {
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

  // Get remote cache keys so we know what already exists
  const { data: remoteRows, error } = await supabase
    .from('bible_cache')
    .select('cache_key, book_id, chapter, translation, data, updated_at')
    .eq('user_id', userId);

  if (error) throw error;

  const remoteKeySet = new Set((remoteRows || []).map((r: { cache_key: string }) => r.cache_key));

  // Merge remote chapters into local — download any we don't have
  for (const remote of remoteRows || []) {
    const locallyExists = localChapters.some(
      l => `${l.bookId}_${l.chapter}_${l.translation}` === remote.cache_key
    );
    if (!locallyExists && remote.data) {
      await bibleStorage.saveChapter(
        remote.book_id,
        remote.chapter,
        remote.translation as BibleTranslation,
        remote.data
      );
    }
  }

  // Upload local chapters that don't exist remotely — batch upsert
  const chaptersToUpload = localChapters
    .filter(local => {
      const key = `${local.bookId}_${local.chapter}_${local.translation}`;
      return !remoteKeySet.has(key);
    })
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
    // Batch in chunks of 50 (chapter data can be large)
    for (let i = 0; i < chaptersToUpload.length; i += 50) {
      const batch = chaptersToUpload.slice(i, i + 50);
      await supabase.from('bible_cache').upsert(batch, { onConflict: 'user_id,cache_key' });
    }
  }

  setSyncState({ lastBibleCacheSync: Date.now() });
}

// =====================================================
// JOURNAL SYNC
// =====================================================
// Supabase table DDL (run via dashboard):
// CREATE TABLE journal (
//   id TEXT PRIMARY KEY,
//   user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
//   title TEXT DEFAULT '',
//   content TEXT DEFAULT '',
//   plain_text TEXT DEFAULT '',
//   drawing TEXT DEFAULT '',
//   latitude DOUBLE PRECISION,
//   longitude DOUBLE PRECISION,
//   location_name TEXT,
//   book_id TEXT,
//   chapter INT,
//   verse_ref TEXT,
//   tags TEXT[] DEFAULT '{}',
//   created_at TIMESTAMPTZ DEFAULT now(),
//   updated_at TIMESTAMPTZ DEFAULT now()
// );
// CREATE INDEX idx_journal_user ON journal(user_id);
// ALTER TABLE journal ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users can manage own journal" ON journal FOR ALL USING (auth.uid() = user_id);

async function syncJournal(): Promise<void> {
  if (!supabase || !canSync()) return;

  const userId = authManager.getUserId();
  if (!userId) return;

  const { journalStorage } = await import('./journalStorage');

  const syncState = getSyncState();
  const { data: remoteEntries, error } = await supabase
    .from('journal')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', new Date(syncState.lastJournalSync).toISOString());

  if (error) throw error;

  // Merge remote into local (remote wins on conflict)
  for (const remote of remoteEntries || []) {
    const local = await journalStorage.getEntry(remote.id);
    if (!local || new Date(remote.updated_at).getTime() > new Date(local.updatedAt).getTime()) {
      if (local) {
        await journalStorage.updateEntry(remote.id, {
          title: remote.title,
          content: remote.content,
          plainText: remote.plain_text,
          drawing: remote.drawing,
          latitude: remote.latitude,
          longitude: remote.longitude,
          locationName: remote.location_name,
          bookId: remote.book_id,
          chapter: remote.chapter,
          verseRef: remote.verse_ref,
          tags: remote.tags || [],
        });
      } else {
        const { idbService } = await import('./idbService');
        await idbService.put('journal', {
          id: remote.id,
          title: remote.title || '',
          content: remote.content || '',
          plainText: remote.plain_text || '',
          drawing: remote.drawing || '',
          latitude: remote.latitude,
          longitude: remote.longitude,
          locationName: remote.location_name,
          bookId: remote.book_id,
          chapter: remote.chapter,
          verseRef: remote.verse_ref,
          tags: remote.tags || [],
          createdAt: remote.created_at,
          updatedAt: remote.updated_at,
        });
      }
    }
  }

  // Upload local entries to remote
  const allLocal = await journalStorage.getAllEntries();
  const remoteIds = new Set((remoteEntries || []).map((r: any) => r.id));
  const toUpload = allLocal.filter(local => {
    if (!remoteIds.has(local.id)) return true;
    const remote = (remoteEntries || []).find((r: any) => r.id === local.id);
    return remote && new Date(local.updatedAt).getTime() > new Date(remote.updated_at).getTime();
  });

  if (toUpload.length > 0) {
    const rows = toUpload.map(e => ({
      id: e.id,
      user_id: userId,
      title: e.title,
      content: e.content,
      plain_text: e.plainText,
      drawing: (e as any).drawing || '',
      latitude: e.latitude || null,
      longitude: e.longitude || null,
      location_name: e.locationName || null,
      book_id: e.bookId || null,
      chapter: e.chapter || null,
      verse_ref: e.verseRef || null,
      tags: e.tags || [],
      created_at: e.createdAt,
      updated_at: e.updatedAt,
    }));

    for (let i = 0; i < rows.length; i += 50) {
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

  // Upload local records that are newer or missing remotely
  const allLocal = await idbService.getAll('chatHistory');
  const remoteIds = new Set((remoteRecords || []).map((r: any) => r.id));
  const toUpload = allLocal.filter(local => {
    if (!remoteIds.has(local.id)) return true;
    const remote = (remoteRecords || []).find((r: any) => r.id === local.id);
    return remote && local.lastModified > remote.last_modified;
  });

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
      await supabase.from('chat_history').upsert(rows.slice(i, i + 50), { onConflict: 'user_id,id' });
    }
  }

  setSyncState({ lastChatHistorySync: Date.now() });
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
    ];

    syncManager.startSync(steps.length);

    for (const step of steps) {
      syncManager.stepStart(step.name);
      try {
        await step.fn();
      } catch {
        // Individual step failure doesn't block others
      }
      syncManager.stepDone(step.name);
    }

    syncManager.setStatus('idle');
  } catch (error) {
    // TODO: use error reporting service
    syncManager.setStatus('error', error instanceof Error ? error.message : 'Sync failed');
    throw error;
  }
}

// =====================================================
// AUTO SYNC ON AUTH STATE CHANGE
// =====================================================

authManager.subscribe(async (state) => {
  if (state.isAuthenticated && !state.isLoading) {
    try {
      await performFullSync();
    } catch (error) {
      // silently handle
    }
  }
});

// =====================================================
// PERIODIC SYNC (every 5 minutes when authenticated)
// =====================================================

if (typeof window !== 'undefined') {
  setInterval(() => {
    if (canSync() && syncManager.getStatus() === 'idle') {
      performFullSync().catch(() => {
        // silently handle
      });
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// =====================================================
// SYNC ON TAB VISIBILITY (e.g. switch back to app)
// =====================================================

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && canSync() && syncManager.getStatus() === 'idle') {
      performFullSync().catch(() => {});
    }
  });
}

// =====================================================
// BACKGROUND SYNC ON LOCAL CHANGES
// =====================================================

let bgSyncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleBgSync() {
  if (!canSync() || syncManager.getStatus() === 'syncing') return;
  if (bgSyncTimer) clearTimeout(bgSyncTimer);
  // Debounce 5 seconds so rapid changes don't flood the server
  bgSyncTimer = setTimeout(() => {
    performFullSync().catch(() => {});
  }, 5000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('versedata-updated', scheduleBgSync);
  window.addEventListener('annotation-updated', scheduleBgSync);
  window.addEventListener('bookmark-updated', scheduleBgSync);
  window.addEventListener('bible-cache-updated', scheduleBgSync);
  window.addEventListener('chathistory-updated', scheduleBgSync);
}

// =====================================================
// EXPORT
// =====================================================

export const syncService = {
  performFullSync,
  syncNotes,
  syncAnnotations,
  syncReadingHistory,
  syncSettings,
  syncVerseData,
  syncBookmarks,
  syncBibleCache,
  syncJournal,
  syncChatHistory,
  canSync,
  getSyncState,
};
