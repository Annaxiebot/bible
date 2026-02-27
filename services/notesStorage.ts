import { idbService } from './idbService';
import { safeGetJSON, safeRemove } from '../utils/localStorageUtil';
import { STORAGE_KEYS } from '../constants/storageKeys';

class NotesStorageService {
  async saveNote(reference: string, data: string): Promise<void> {
    try {
      await idbService.put('notes', {
        reference,
        data,
        lastModified: Date.now()
      }, reference);
    } catch (error) {
      // TODO: use error reporting service
      throw error;
    }
  }

  async getNote(reference: string): Promise<string | null> {
    try {
      const note = await idbService.get('notes', reference);
      return note?.data || null;
    } catch (error) {
      // silently handle
      return null;
    }
  }

  async getAllNotes(): Promise<Record<string, string>> {
    try {
      const allNotes = await idbService.getAll('notes');
      const notesMap: Record<string, string> = {};

      for (const note of allNotes) {
        if (note.reference && note.data) {
          notesMap[note.reference] = note.data;
        }
      }

      return notesMap;
    } catch (error) {
      // silently handle
      return {};
    }
  }

  async deleteNote(reference: string): Promise<void> {
    try {
      await idbService.delete('notes', reference);
    } catch (error) {
      // TODO: use error reporting service
      throw error;
    }
  }

  async clearAllNotes(): Promise<void> {
    try {
      await idbService.clear('notes');
    } catch (error) {
      // TODO: use error reporting service
      throw error;
    }
  }

  async importNotes(notes: Record<string, string>): Promise<void> {
    try {
      const db = await idbService.getDB();
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
      // TODO: use error reporting service
      throw error;
    }
  }

  // Migration helper: move localStorage notes to IndexedDB
  async migrateFromLocalStorage(): Promise<void> {
    try {
      const notes = safeGetJSON<Record<string, string> | null>(STORAGE_KEYS.LEGACY_NOTES, null);
      if (notes) {
        await this.importNotes(notes);
        // Remove from localStorage after successful migration
        safeRemove(STORAGE_KEYS.LEGACY_NOTES);
      }
    } catch (error) {
      // silently handle
    }
  }
}

export const notesStorage = new NotesStorageService();
