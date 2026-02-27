import { idbService } from './idbService';
import { VerseData, PersonalNote, AIResearchEntry } from '../types/verseData';
import { stripHTML } from '../utils/textUtils';

class VerseDataStorage {
  /** No-op: retained for backward compatibility. DB is initialized by idbService. */
  async initialize(): Promise<void> {
    // DB is managed by the unified idbService singleton
  }

  private notifyUpdate(): void {
    window.dispatchEvent(new CustomEvent('versedata-updated'));
  }

  // Get verse data for a specific verse
  async getVerseData(bookId: string, chapter: number, verses: number[]): Promise<VerseData | null> {
    const id = this.createId(bookId, chapter, verses);

    try {
      const data = await idbService.get('verseData', id);
      return data || null;
    } catch (error) {
      // silently handle
      return null;
    }
  }

  // Save or update personal note
  async savePersonalNote(
    bookId: string,
    chapter: number,
    verses: number[],
    note: PersonalNote
  ): Promise<void> {
    const id = this.createId(bookId, chapter, verses);

    try {
      const existing = await idbService.get('verseData', id);

      const verseData: VerseData = existing || {
        id,
        bookId,
        chapter,
        verses,
        aiResearch: []
      };

      verseData.personalNote = {
        ...note,
        createdAt: existing?.personalNote?.createdAt || note.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      await idbService.put('verseData', verseData);
      this.notifyUpdate();
    } catch (error) {
      // TODO: use error reporting service
    }
  }

  // Delete personal note
  async deletePersonalNote(bookId: string, chapter: number, verses: number[]): Promise<void> {
    const id = this.createId(bookId, chapter, verses);

    try {
      const existing = await idbService.get('verseData', id);
      if (existing) {
        delete existing.personalNote;

        // If no AI research exists either, delete the entire record
        if (existing.aiResearch.length === 0) {
          await idbService.delete('verseData', id);
        } else {
          await idbService.put('verseData', existing);
        }
        this.notifyUpdate();
      }
    } catch (error) {
      // silently handle
    }
  }

  // Add AI research entry
  async addAIResearch(
    bookId: string,
    chapter: number,
    verses: number[],
    research: Omit<AIResearchEntry, 'id' | 'timestamp'>
  ): Promise<string> {
    const id = this.createId(bookId, chapter, verses);
    const researchId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      const existing = await idbService.get('verseData', id);

      const verseData: VerseData = existing || {
        id,
        bookId,
        chapter,
        verses,
        aiResearch: []
      };

      const aiEntry: AIResearchEntry = {
        ...research,
        id: researchId,
        timestamp: Date.now()
      };

      verseData.aiResearch.push(aiEntry);
      await idbService.put('verseData', verseData);
      this.notifyUpdate();
      return researchId;
    } catch (error) {
      // TODO: use error reporting service
      throw error;
    }
  }

  // Delete AI research entry
  async deleteAIResearch(bookId: string, chapter: number, verses: number[], researchId: string): Promise<void> {
    const id = this.createId(bookId, chapter, verses);

    try {
      const existing = await idbService.get('verseData', id);
      if (existing) {
        existing.aiResearch = existing.aiResearch.filter(r => r.id !== researchId);

        // If no content remains, delete the entire record
        if (!existing.personalNote && existing.aiResearch.length === 0) {
          await idbService.delete('verseData', id);
        } else {
          await idbService.put('verseData', existing);
        }
        this.notifyUpdate();
      }
    } catch (error) {
      // silently handle
    }
  }

  // Get all verse data for a book
  async getBookData(bookId: string): Promise<VerseData[]> {
    try {
      return await idbService.getAllFromIndex('verseData', 'by-book', bookId);
    } catch (error) {
      // silently handle
      return [];
    }
  }

  // Get all verse data for a specific chapter in a single DB transaction
  async getChapterData(bookId: string, chapter: number): Promise<Map<string, VerseData>> {
    const result = new Map<string, VerseData>();
    try {
      const db = await idbService.getDB();
      const tx = db.transaction('verseData', 'readonly');
      const store = tx.objectStore('verseData');
      const prefix = `${bookId}:${chapter}:`;
      let cursor = await store.openCursor();
      while (cursor) {
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          result.set(cursor.key, cursor.value);
        } else if (typeof cursor.key === 'string' && cursor.key > prefix + '\uffff') {
          break; // Past our range, stop iterating
        }
        cursor = await cursor.continue();
      }
    } catch (error) {
      // silently handle
    }
    return result;
  }

  // Get all verse data
  async getAllData(): Promise<VerseData[]> {
    try {
      return await idbService.getAll('verseData');
    } catch (error) {
      // silently handle
      return [];
    }
  }

  // Search in personal notes
  async searchNotes(query: string): Promise<VerseData[]> {
    const results: VerseData[] = [];
    const searchTerm = query.toLowerCase();

    try {
      const allData = await idbService.getAll('verseData');

      for (const data of allData) {
        if (data.personalNote?.text &&
            data.personalNote.text.toLowerCase().includes(searchTerm)) {
          results.push(data);
        }
      }

      return results;
    } catch (error) {
      // silently handle
      return [];
    }
  }

  // Search in AI research
  async searchResearch(query: string): Promise<VerseData[]> {
    const results: VerseData[] = [];
    const searchTerm = query.toLowerCase();

    try {
      const allData = await idbService.getAll('verseData');

      for (const data of allData) {
        const hasMatch = data.aiResearch.some(r =>
          r.query.toLowerCase().includes(searchTerm) ||
          stripHTML(r.response).toLowerCase().includes(searchTerm) ||
          r.tags?.some(tag => tag.toLowerCase().includes(searchTerm))
        );

        if (hasMatch) {
          results.push(data);
        }
      }

      return results;
    } catch (error) {
      // silently handle
      return [];
    }
  }

  // Migrate from old notes format
  async migrateFromOldNotes(oldNotes: Record<string, string>): Promise<void> {
    try {
      for (const [key, content] of Object.entries(oldNotes)) {
        // Parse the old key format: "bookId:chapter:verse"
        const parts = key.split(':');
        if (parts.length >= 3) {
          const bookId = parts[0];
          const chapter = parseInt(parts[1]);
          const verses = [parseInt(parts[2])];

          // Skip if already migrated
          const existing = await this.getVerseData(bookId, chapter, verses);
          if (existing?.personalNote) continue;

          const note: PersonalNote = {
            text: content,
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          await this.savePersonalNote(bookId, chapter, verses, note);
        }
      }
    } catch (error) {
      // silently handle
    }
  }

  // Clear all data
  async clearAll(): Promise<void> {
    try {
      await idbService.clear('verseData');
      this.notifyUpdate();
    } catch (error) {
      // silently handle
    }
  }

  // Helper to create consistent IDs (using colons to match the rest of the app)
  private createId(bookId: string, chapter: number, verses: number[]): string {
    const versesStr = verses.sort((a, b) => a - b).join('_');
    const id = `${bookId}:${chapter}:${versesStr}`;
    return id;
  }

  // Migrate old IDs from underscore to colon format
  async migrateIds(): Promise<void> {
    try {
      const db = await idbService.getDB();
      const tx = db.transaction('verseData', 'readwrite');
      const store = tx.objectStore('verseData');
      const allData = await store.getAll();

      for (const data of allData) {
        // Check if ID uses old underscore format
        if (data.id && data.id.includes('_') && !data.id.includes(':')) {
          // Convert EXO_1_2 to EXO:1:2
          const parts = data.id.split('_');
          if (parts.length >= 3) {
            const newId = `${parts[0]}:${parts[1]}:${parts.slice(2).join('_')}`;

            // Delete old entry
            await store.delete(data.id);

            // Add with new ID
            data.id = newId;
            await store.put(data);
          }
        }
      }

      await tx.done;
    } catch (error) {
      // silently handle
    }
  }

  // Clear all personal notes
  async clearAllPersonalNotes(): Promise<void> {
    try {
      const db = await idbService.getDB();
      const tx = db.transaction('verseData', 'readwrite');
      const store = tx.objectStore('verseData');
      const allData = await store.getAll();

      for (const data of allData) {
        if (data.personalNote) {
          delete data.personalNote;
          // If no AI research either, delete the entire entry
          if (!data.aiResearch || data.aiResearch.length === 0) {
            await store.delete(data.id);
          } else {
            await store.put(data);
          }
        }
      }

      await tx.done;
      this.notifyUpdate();
    } catch (error) {
      // TODO: use error reporting service
      throw error;
    }
  }

  // Clear all AI research
  async clearAllAIResearch(): Promise<void> {
    try {
      const db = await idbService.getDB();
      const tx = db.transaction('verseData', 'readwrite');
      const store = tx.objectStore('verseData');
      const allData = await store.getAll();

      for (const data of allData) {
        if (data.aiResearch && data.aiResearch.length > 0) {
          data.aiResearch = [];
          // If no personal note either, delete the entire entry
          if (!data.personalNote) {
            await store.delete(data.id);
          } else {
            await store.put(data);
          }
        }
      }

      await tx.done;
      this.notifyUpdate();
    } catch (error) {
      // TODO: use error reporting service
      throw error;
    }
  }

  // Export all data for backup
  async exportData(): Promise<VerseData[]> {
    return this.getAllData();
  }

  // Import data from backup
  async importData(data: VerseData[], strategy: 'replace' | 'merge' | 'skip' = 'merge'): Promise<void> {
    try {
      for (const item of data) {
        const existing = await idbService.get('verseData', item.id);

        if (!existing) {
          // No existing data, just add it
          await idbService.put('verseData', item);
        } else if (strategy === 'replace') {
          // Replace existing data
          await idbService.put('verseData', item);
        } else if (strategy === 'merge') {
          // Merge data (combine AI research, keep newer personal note)
          const merged: VerseData = {
            ...existing,
            personalNote: this.mergePersonalNotes(existing.personalNote, item.personalNote),
            aiResearch: this.mergeAIResearch(existing.aiResearch, item.aiResearch)
          };
          await idbService.put('verseData', merged);
        }
        // 'skip' strategy does nothing if data exists
      }
      this.notifyUpdate();
    } catch (error) {
      // TODO: use error reporting service
      throw error;
    }
  }

  private mergePersonalNotes(existing?: PersonalNote, incoming?: PersonalNote): PersonalNote | undefined {
    if (!existing) return incoming;
    if (!incoming) return existing;

    // Keep the newer note
    return existing.updatedAt >= incoming.updatedAt ? existing : incoming;
  }

  private mergeAIResearch(existing: AIResearchEntry[], incoming: AIResearchEntry[]): AIResearchEntry[] {
    const merged = [...existing];
    const existingIds = new Set(existing.map(r => r.id));

    // Add new research entries that don't exist
    for (const research of incoming) {
      if (!existingIds.has(research.id)) {
        merged.push(research);
      }
    }

    // Sort by timestamp, newest first
    return merged.sort((a, b) => b.timestamp - a.timestamp);
  }
}

export const verseDataStorage = new VerseDataStorage();
