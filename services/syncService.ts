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

// =====================================================
// SYNC STATE
// =====================================================

interface SyncState {
  lastNotesSync: number;
  lastAnnotationsSync: number;
  lastHistorySync: number;
  lastSettingsSync: number;
}

const SYNC_STATE_KEY = STORAGE_KEYS.SYNC_STATE;

function getSyncState(): SyncState {
  try {
    const data = localStorage.getItem(SYNC_STATE_KEY);
    return data ? JSON.parse(data) : {
      lastNotesSync: 0,
      lastAnnotationsSync: 0,
      lastHistorySync: 0,
      lastSettingsSync: 0
    };
  } catch {
    return {
      lastNotesSync: 0,
      lastAnnotationsSync: 0,
      lastHistorySync: 0,
      lastSettingsSync: 0
    };
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
  STORAGE_KEYS.AUTO_SAVE_RESEARCH,
  STORAGE_KEYS.ENGLISH_VERSION,
  STORAGE_KEYS.CHINESE_MODE,
  STORAGE_KEYS.FONT_SIZE,
  STORAGE_KEYS.VIEW_LAYOUT,
  'useFreeRouter',
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
// FULL SYNC
// =====================================================

export async function performFullSync(): Promise<void> {
  if (!canSync()) {
    return;
  }

  try {
    syncManager.setStatus('syncing');
    
    await Promise.all([
      syncNotes(),
      syncAnnotations(),
      syncReadingHistory(),
      syncSettings()
    ]);

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
  canSync,
  getSyncState,
};
