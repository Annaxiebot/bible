import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface NotesDB extends DBSchema {
  notes: {
    key: string;
    value: {
      reference: string;
      data: string;
      lastModified: number;
    };
  };
}

class NotesStorageService {
  private dbPromise: Promise<IDBPDatabase<NotesDB>>;

  constructor() {
    this.dbPromise = openDB<NotesDB>('BibleNotesDB', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('notes')) {
          db.createObjectStore('notes');
        }
      },
    });
  }

  async saveNote(reference: string, data: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.put('notes', {
        reference,
        data,
        lastModified: Date.now()
      }, reference);
    } catch (error) {
      console.error('Failed to save note to IndexedDB:', error);
      throw error;
    }
  }

  async getNote(reference: string): Promise<string | null> {
    try {
      const db = await this.dbPromise;
      const note = await db.get('notes', reference);
      return note?.data || null;
    } catch (error) {
      console.error('Failed to get note from IndexedDB:', error);
      return null;
    }
  }

  async getAllNotes(): Promise<Record<string, string>> {
    try {
      const db = await this.dbPromise;
      const allNotes = await db.getAll('notes');
      const notesMap: Record<string, string> = {};
      
      for (const note of allNotes) {
        if (note.reference && note.data) {
          notesMap[note.reference] = note.data;
        }
      }
      
      return notesMap;
    } catch (error) {
      console.error('Failed to get all notes from IndexedDB:', error);
      return {};
    }
  }

  async deleteNote(reference: string): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.delete('notes', reference);
    } catch (error) {
      console.error('Failed to delete note from IndexedDB:', error);
      throw error;
    }
  }

  async clearAllNotes(): Promise<void> {
    try {
      const db = await this.dbPromise;
      await db.clear('notes');
    } catch (error) {
      console.error('Failed to clear all notes from IndexedDB:', error);
      throw error;
    }
  }

  async importNotes(notes: Record<string, string>): Promise<void> {
    try {
      const db = await this.dbPromise;
      const tx = db.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      
      for (const [reference, data] of Object.entries(notes)) {
        await store.put({
          reference,
          data,
          lastModified: Date.now()
        }, reference);
      }
      
      await tx.done;
    } catch (error) {
      console.error('Failed to import notes to IndexedDB:', error);
      throw error;
    }
  }

  // Migration helper: move localStorage notes to IndexedDB
  async migrateFromLocalStorage(): Promise<void> {
    try {
      const localStorageNotes = localStorage.getItem('scripture_scholar_notes');
      if (localStorageNotes) {
        const notes = JSON.parse(localStorageNotes);
        await this.importNotes(notes);
        // Remove from localStorage after successful migration
        localStorage.removeItem('scripture_scholar_notes');
        console.log('Successfully migrated notes from localStorage to IndexedDB');
      }
    } catch (error) {
      console.error('Failed to migrate notes from localStorage:', error);
    }
  }
}

export const notesStorage = new NotesStorageService();