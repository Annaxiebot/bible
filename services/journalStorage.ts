import { idbService } from './idbService';
import { JournalEntry } from '../types';

/**
 * Generate a unique ID for journal entries.
 * Format: journal-<timestamp>-<random>
 */
function generateId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `journal-${ts}-${rand}`;
}

class JournalStorageService {
  async saveEntry(entry: Omit<JournalEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<JournalEntry> {
    const now = Date.now();
    const fullEntry: JournalEntry = {
      id: generateId(),
      ...entry,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await idbService.put('journal', fullEntry);
      return fullEntry;
    } catch (error) {
      throw error;
    }
  }

  async updateEntry(id: string, updates: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>): Promise<JournalEntry | null> {
    try {
      const existing = await idbService.get('journal', id);
      if (!existing) return null;

      const updated: JournalEntry = {
        ...existing,
        ...updates,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
      };

      await idbService.put('journal', updated);
      return updated;
    } catch (error) {
      throw error;
    }
  }

  async getEntry(id: string): Promise<JournalEntry | null> {
    try {
      const entry = await idbService.get('journal', id);
      return entry || null;
    } catch (error) {
      return null;
    }
  }

  async getAllEntries(): Promise<JournalEntry[]> {
    try {
      const entries = await idbService.getAll('journal');
      // Sort by updatedAt descending (newest first)
      return entries.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (error) {
      return [];
    }
  }

  async getEntriesByDateRange(from: number, to: number): Promise<JournalEntry[]> {
    try {
      const all = await this.getAllEntries();
      return all.filter(e => e.createdAt >= from && e.createdAt <= to);
    } catch (error) {
      return [];
    }
  }

  async deleteEntry(id: string): Promise<void> {
    try {
      await idbService.delete('journal', id);
    } catch (error) {
      throw error;
    }
  }

  async clearAllEntries(): Promise<void> {
    try {
      await idbService.clear('journal');
    } catch (error) {
      throw error;
    }
  }

  async getEntryCount(): Promise<number> {
    try {
      return await idbService.count('journal');
    } catch (error) {
      return 0;
    }
  }

  async searchEntries(query: string): Promise<JournalEntry[]> {
    try {
      const all = await this.getAllEntries();
      const lowerQuery = query.toLowerCase();
      return all.filter(e =>
        e.title.toLowerCase().includes(lowerQuery) ||
        e.content.toLowerCase().includes(lowerQuery) ||
        e.tags?.some(t => t.toLowerCase().includes(lowerQuery))
      );
    } catch (error) {
      return [];
    }
  }
}

export const journalStorage = new JournalStorageService();
