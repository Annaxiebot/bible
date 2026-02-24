/**
 * googleDriveSyncService.ts
 * 
 * Sync service for Google Drive integration.
 * Handles bidirectional sync between IndexedDB and Google Drive.
 * 
 * Features:
 * - Debounced sync (10 seconds)
 * - Last-write-wins conflict resolution
 * - Incremental sync (only changed data)
 * - Background sync on app startup
 * - Offline-first (IndexedDB is source of truth)
 */

import { googleDrive, DRIVE_FILES } from './googleDrive';
import { notesStorage } from './notesStorage';
import { bookmarkStorage, Bookmark } from './bookmarkStorage';
import { annotationStorage, AnnotationRecord } from './annotationStorage';
import { readingHistory } from './readingHistory';
import type {
  Note,
  ReadingHistoryEntry,
  ReadingPosition,
  AppSettings,
} from './types';

// =====================================================
// SYNC STATE
// =====================================================

interface SyncQueueItem {
  type: 'notes' | 'bookmarks' | 'annotations' | 'settings' | 'history' | 'plans' | 'verseData';
  timestamp: number;
}

class GoogleDriveSyncService {
  private syncQueue = new Map<string, SyncQueueItem>();
  private isSyncing = false;
  private debounceTimer: number | null = null;
  private readonly DEBOUNCE_MS = 10000; // 10 seconds

  // =====================================================
  // QUEUE MANAGEMENT
  // =====================================================

  /**
   * Queue a sync operation (debounced).
   */
  queueSync(dataType: 'notes' | 'bookmarks' | 'annotations' | 'settings' | 'history' | 'plans' | 'verseData'): void {
    if (!googleDrive.isSignedIn()) {
      return; // Skip if not signed in
    }

    this.syncQueue.set(dataType, {
      type: dataType,
      timestamp: Date.now(),
    });

    // Clear existing timer
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = window.setTimeout(() => {
      this.syncNow().catch(err => {
        console.error('Debounced sync failed:', err);
      });
    }, this.DEBOUNCE_MS);
  }

  /**
   * Sync immediately (all queued items).
   */
  async syncNow(): Promise<void> {
    if (!googleDrive.isSignedIn() || this.isSyncing) {
      return;
    }

    if (this.syncQueue.size === 0) {
      return; // Nothing to sync
    }

    this.isSyncing = true;

    try {
      const items = Array.from(this.syncQueue.values());
      this.syncQueue.clear();

      // Sync each queued item
      for (const item of items) {
        switch (item.type) {
          case 'notes':
            await this.syncNotes();
            break;
          case 'bookmarks':
            await this.syncBookmarks();
            break;
          case 'annotations':
            await this.syncAnnotations();
            break;
          case 'history':
            await this.syncReadingHistory();
            break;
          case 'settings':
            await this.syncSettings();
            break;
          default:
            console.warn(`Unknown sync type: ${item.type}`);
        }
      }

      // Update last sync time
      await googleDrive.setLastSyncTime(Date.now());
      
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Full sync (all data types).
   * Called on app startup or manual sync.
   */
  async syncAll(): Promise<void> {
    if (!googleDrive.isSignedIn()) {
      console.log('Cannot sync: not signed in');
      return;
    }

    this.isSyncing = true;

    try {
      console.log('Starting full sync...');
      
      await Promise.all([
        this.syncNotes(),
        this.syncBookmarks(),
        this.syncAnnotations(),
        this.syncReadingHistory(),
        this.syncSettings(),
      ]);

      await googleDrive.setLastSyncTime(Date.now());
      
      console.log('Full sync completed successfully');
    } catch (error) {
      console.error('Full sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  // =====================================================
  // NOTES SYNC
  // =====================================================

  private async syncNotes(): Promise<void> {
    console.log('Syncing notes...');

    // Get local notes
    const localNotesMap = await notesStorage.getAllNotes();
    const localNotes: Note[] = Object.entries(localNotesMap).map(([reference, content]) => {
      // Parse reference: "GEN 1:1" -> bookId: GEN, chapter: 1, verse: 1
      const parts = reference.split(' ');
      const bookId = parts[0];
      const chapterVerse = parts.slice(1).join(' ');
      const [chapterStr, verseStr] = chapterVerse.split(':');
      const chapter = parseInt(chapterStr, 10) || 1;
      const verse = verseStr ? parseInt(verseStr, 10) : undefined;

      return {
        id: reference,
        bookId,
        chapter,
        verse,
        content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    });

    // Get remote notes
    const remoteNotes: Note[] = await googleDrive.readFile(DRIVE_FILES.NOTES) || [];

    // Merge (last-write-wins)
    const merged = this.mergeNotes(localNotes, remoteNotes);

    // Update local
    for (const note of merged) {
      if (note.content) {
        await notesStorage.saveNote(note.id, note.content);
      }
    }

    // Update remote
    await googleDrive.writeFile(DRIVE_FILES.NOTES, merged);
    
    console.log(`Notes synced: ${merged.length} total`);
  }

  private mergeNotes(local: Note[], remote: Note[]): Note[] {
    const merged = new Map<string, Note>();

    // Add all local notes
    for (const note of local) {
      merged.set(note.id, note);
    }

    // Merge remote notes (last-write-wins)
    for (const note of remote) {
      const existing = merged.get(note.id);
      if (!existing || note.updatedAt > existing.updatedAt) {
        merged.set(note.id, note);
      }
    }

    return Array.from(merged.values());
  }

  // =====================================================
  // BOOKMARKS SYNC
  // =====================================================

  private async syncBookmarks(): Promise<void> {
    console.log('Syncing bookmarks...');

    // Get local bookmarks
    const localBookmarks = await bookmarkStorage.getAllBookmarks();

    // Get remote bookmarks
    const remoteBookmarks: Bookmark[] = await googleDrive.readFile(DRIVE_FILES.BOOKMARKS) || [];

    // Merge
    const merged = this.mergeBookmarks(localBookmarks, remoteBookmarks);

    // Update local (clear and re-add all)
    const allLocal = await bookmarkStorage.getAllBookmarks();
    for (const bookmark of allLocal) {
      await bookmarkStorage.removeBookmark(bookmark.id);
    }
    for (const bookmark of merged) {
      await bookmarkStorage.importBookmark(bookmark);
    }

    // Update remote
    await googleDrive.writeFile(DRIVE_FILES.BOOKMARKS, merged);
    
    console.log(`Bookmarks synced: ${merged.length} total`);
  }

  private mergeBookmarks(local: Bookmark[], remote: Bookmark[]): Bookmark[] {
    const merged = new Map<string, Bookmark>();

    // Add all local bookmarks
    for (const bookmark of local) {
      merged.set(bookmark.id, bookmark);
    }

    // Add remote bookmarks (keep both if different)
    for (const bookmark of remote) {
      const existing = merged.get(bookmark.id);
      if (!existing || bookmark.createdAt > existing.createdAt) {
        merged.set(bookmark.id, bookmark);
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  // =====================================================
  // ANNOTATIONS SYNC
  // =====================================================

  private async syncAnnotations(): Promise<void> {
    console.log('Syncing annotations...');

    // Get local annotations
    const localAnnotations = await annotationStorage.getAllAnnotations();

    // Convert to simplified format for Drive
    const localFormatted = localAnnotations.map(a => ({
      id: a.id,
      bookId: a.bookId,
      chapter: a.chapter,
      canvasData: a.canvasData,
      canvasHeight: a.canvasHeight,
      canvasWidth: a.canvasWidth,
      fontSize: a.fontSize,
      vSplitOffset: a.vSplitOffset,
      panelId: a.panelId,
      lastModified: a.lastModified,
    }));

    // Get remote annotations
    const remoteAnnotations = await googleDrive.readFile(DRIVE_FILES.ANNOTATIONS) || [];

    // Merge (last-write-wins)
    const merged = this.mergeAnnotations(localFormatted, remoteAnnotations);

    // Update local
    for (const annotation of merged) {
      await annotationStorage.importAnnotation({
        id: annotation.id,
        bookId: annotation.bookId,
        chapter: annotation.chapter,
        canvasData: annotation.canvasData,
        canvasHeight: annotation.canvasHeight || 0,
        canvasWidth: annotation.canvasWidth,
        fontSize: annotation.fontSize,
        vSplitOffset: annotation.vSplitOffset,
        panelId: annotation.panelId,
        lastModified: annotation.lastModified || Date.now(),
      });
    }

    // Update remote
    await googleDrive.writeFile(DRIVE_FILES.ANNOTATIONS, merged);
    
    console.log(`Annotations synced: ${merged.length} total`);
  }

  private mergeAnnotations(local: any[], remote: any[]): any[] {
    const merged = new Map<string, any>();

    // Add all local annotations
    for (const annotation of local) {
      merged.set(annotation.id, annotation);
    }

    // Merge remote annotations (last-write-wins)
    for (const annotation of remote) {
      const existing = merged.get(annotation.id);
      if (!existing || annotation.lastModified > existing.lastModified) {
        merged.set(annotation.id, annotation);
      }
    }

    return Array.from(merged.values());
  }

  // =====================================================
  // READING HISTORY SYNC
  // =====================================================

  private async syncReadingHistory(): Promise<void> {
    console.log('Syncing reading history...');

    // Get local history
    const localHistory = readingHistory.getHistory();
    const lastRead = readingHistory.getLastRead();

    // Get remote history
    const remoteData = await googleDrive.readFile(DRIVE_FILES.READING_HISTORY) || {
      history: [],
      lastRead: null,
    };

    // Merge history
    const merged = this.mergeReadingHistory(localHistory, remoteData.history || []);

    // Merge last read position
    let mergedLastRead = lastRead;
    if (remoteData.lastRead) {
      if (!lastRead || remoteData.lastRead.timestamp > lastRead.timestamp) {
        mergedLastRead = remoteData.lastRead;
      }
    }

    // Update local
    // Clear and rebuild history
    readingHistory.clearHistory();
    for (const entry of merged) {
      readingHistory.addToHistory(
        entry.bookId,
        entry.bookName,
        entry.chapter,
        entry.hasNotes,
        entry.hasAIResearch
      );
    }
    if (mergedLastRead) {
      readingHistory.saveLastRead(
        mergedLastRead.bookId,
        mergedLastRead.bookName,
        mergedLastRead.chapter
      );
    }

    // Update remote
    await googleDrive.writeFile(DRIVE_FILES.READING_HISTORY, {
      history: merged,
      lastRead: mergedLastRead,
    });
    
    console.log(`Reading history synced: ${merged.length} entries`);
  }

  private mergeReadingHistory(
    local: ReadingHistoryEntry[],
    remote: ReadingHistoryEntry[]
  ): ReadingHistoryEntry[] {
    const merged = new Map<string, ReadingHistoryEntry>();

    // Add all local entries
    for (const entry of local) {
      const key = `${entry.bookId}:${entry.chapter}`;
      merged.set(key, entry);
    }

    // Merge remote entries (last-write-wins)
    for (const entry of remote) {
      const key = `${entry.bookId}:${entry.chapter}`;
      const existing = merged.get(key);
      if (!existing || entry.lastRead > existing.lastRead) {
        merged.set(key, entry);
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.lastRead - a.lastRead);
  }

  // =====================================================
  // SETTINGS SYNC
  // =====================================================

  private async syncSettings(): Promise<void> {
    console.log('Syncing settings...');

    // Get local settings (from localStorage)
    const localSettings: Partial<AppSettings> = {
      fontSize: parseInt(localStorage.getItem('fontSize') || '16', 10),
      chineseMode: (localStorage.getItem('chineseMode') || 'simplified') as 'simplified' | 'traditional',
      theme: (localStorage.getItem('theme') || 'light') as 'light' | 'dark' | 'sepia',
    };

    // Get remote settings
    const remoteSettings = await googleDrive.readFile(DRIVE_FILES.SETTINGS);

    // Merge (remote wins for now, can add timestamps later)
    const merged = remoteSettings || localSettings;

    // Update local
    if (merged.fontSize) localStorage.setItem('fontSize', merged.fontSize.toString());
    if (merged.chineseMode) localStorage.setItem('chineseMode', merged.chineseMode);
    if (merged.theme) localStorage.setItem('theme', merged.theme);

    // Update remote
    await googleDrive.writeFile(DRIVE_FILES.SETTINGS, merged);
    
    console.log('Settings synced');
  }

  // =====================================================
  // STATUS
  // =====================================================

  isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  canSync(): boolean {
    return googleDrive.isSignedIn();
  }
}

// Singleton instance
export const googleDriveSyncService = new GoogleDriveSyncService();

// Auto-sync on sign-in
if (typeof window !== 'undefined') {
  googleDrive.subscribe((state) => {
    if (state.isSignedIn && !state.lastError) {
      console.log('User signed in - starting initial sync');
      googleDriveSyncService.syncAll().catch(err => {
        console.error('Initial sync failed:', err);
      });
    }
  });

  // Sync before page unload
  window.addEventListener('beforeunload', () => {
    if (googleDriveSyncService.canSync() && !googleDriveSyncService.isSyncInProgress()) {
      // Quick sync attempt (may not complete if page closes fast)
      googleDriveSyncService.syncNow().catch(() => {});
    }
  });
}
