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
  DbNote,
  DbAnnotation,
  DbReadingHistory,
  DbLastRead
} from './supabase';
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

const SYNC_STATE_KEY = 'bible-app-sync-state';

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
    console.error('Failed to fetch remote notes:', error);
    throw error;
  }

  // Merge remote notes into local (remote wins on conflict)
  for (const remoteNote of remoteNotes || []) {
    await notesStorage.saveNote(remoteNote.reference, remoteNote.content);
  }

  // Upload local notes that don't exist remotely or are newer
  for (const [reference, content] of Object.entries(localNotes)) {
    const existingRemote = remoteNotes?.find(n => n.reference === reference);
    
    if (!existingRemote) {
      // New local note - upload it
      const parts = reference.split(' ');
      const bookId = parts[0];
      const chapterVerse = parts.slice(1).join(' ');
      const [chapter, verse] = chapterVerse.split(':').map(n => parseInt(n, 10));

      await supabase.from('notes').upsert({
        user_id: userId,
        reference,
        book_id: bookId,
        chapter: chapter || 1,
        verse: verse || null,
        content,
        updated_at: new Date().toISOString()
      });
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
  const db = await (annotationStorage as any).dbPromise;
  const localAnnotations: AnnotationRecord[] = await db.getAll('annotations');

  // Get remote annotations modified since last sync
  const syncState = getSyncState();
  const { data: remoteAnnotations, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('user_id', userId)
    .gte('updated_at', new Date(syncState.lastAnnotationsSync).toISOString());

  if (error) {
    console.error('Failed to fetch remote annotations:', error);
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

  // Upload local annotations to remote
  for (const local of localAnnotations) {
    const matchKey = `${local.bookId}:${local.chapter}:${local.panelId || ''}`;
    const existingRemote = remoteAnnotations?.find(r => 
      r.book_id === local.bookId && 
      r.chapter === local.chapter && 
      (r.panel_id || '') === (local.panelId || '')
    );

    if (!existingRemote || local.lastModified > new Date(existingRemote.updated_at).getTime()) {
      await supabase.from('annotations').upsert({
        user_id: userId,
        book_id: local.bookId,
        chapter: local.chapter,
        panel_id: local.panelId || null,
        canvas_data: local.canvasData,
        canvas_height: local.canvasHeight,
        updated_at: new Date(local.lastModified).toISOString()
      }, {
        onConflict: 'user_id,book_id,chapter,panel_id'
      });
    }
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
  const syncState = getSyncState();
  const { data: remoteHistory, error: historyError } = await supabase
    .from('reading_history')
    .select('*')
    .eq('user_id', userId);

  if (historyError) {
    console.error('Failed to fetch remote history:', historyError);
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

  // Upload local history to remote
  for (const local of localHistory) {
    await supabase.from('reading_history').upsert({
      user_id: userId,
      book_id: local.bookId,
      book_name: local.bookName,
      chapter: local.chapter,
      last_read: new Date(local.lastRead).toISOString(),
      has_notes: local.hasNotes || false,
      has_ai_research: local.hasAIResearch || false
    }, {
      onConflict: 'user_id,book_id,chapter'
    });
  }

  // Sync last read position
  if (lastRead) {
    await supabase.from('last_read').upsert({
      user_id: userId,
      book_id: lastRead.bookId,
      book_name: lastRead.bookName,
      chapter: lastRead.chapter,
      updated_at: new Date(lastRead.timestamp).toISOString()
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
      syncReadingHistory()
    ]);

    syncManager.setStatus('idle');
  } catch (error) {
    console.error('Sync failed:', error);
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
      console.error('Initial sync failed:', error);
    }
  }
});

// =====================================================
// PERIODIC SYNC (every 5 minutes when authenticated)
// =====================================================

if (typeof window !== 'undefined') {
  setInterval(() => {
    if (canSync() && syncManager.getStatus() === 'idle') {
      performFullSync().catch(err => {
        console.error('Periodic sync failed:', err);
      });
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// =====================================================
// EXPORT
// =====================================================

export const syncService = {
  performFullSync,
  syncNotes,
  syncAnnotations,
  syncReadingHistory,
  canSync,
  getSyncState,
};
