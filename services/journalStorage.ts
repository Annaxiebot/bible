/**
 * journalStorage.ts
 *
 * CRUD service for journal entries stored in the 'journal' IndexedDB store.
 * Follows the same pattern as notesStorage.ts.
 */

import { idbService, JournalEntry } from './idbService';

function generateId(): string {
  return `journal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class JournalStorageService {
  async createEntry(params: {
    title?: string;
    content?: string;
    plainText?: string;
    latitude?: number;
    longitude?: number;
    locationName?: string;
    bookId?: string;
    chapter?: number;
    verseRef?: string;
    tags?: string[];
  }): Promise<JournalEntry> {
    const now = new Date().toISOString();
    const entry: JournalEntry = {
      id: generateId(),
      title: params.title || '',
      content: params.content || '',
      plainText: params.plainText || '',
      latitude: params.latitude,
      longitude: params.longitude,
      locationName: params.locationName,
      bookId: params.bookId,
      chapter: params.chapter,
      verseRef: params.verseRef,
      tags: params.tags || [],
      createdAt: now,
      updatedAt: now,
    };
    await idbService.put('journal', entry);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('journal-updated'));
    return entry;
  }

  async updateEntry(
    id: string,
    updates: Partial<Omit<JournalEntry, 'id' | 'createdAt'>>
  ): Promise<JournalEntry | null> {
    const existing = await idbService.get('journal', id);
    if (!existing) return null;
    const updated: JournalEntry = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await idbService.put('journal', updated);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('journal-updated'));
    return updated;
  }

  async deleteEntry(id: string): Promise<void> {
    await idbService.delete('journal', id);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('journal-updated'));
  }

  async getEntry(id: string): Promise<JournalEntry | null> {
    const entry = await idbService.get('journal', id);
    return entry ?? null;
  }

  async getAllEntries(): Promise<JournalEntry[]> {
    const all = await idbService.getAll('journal');
    // Sort newest first by createdAt
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async searchEntries(query: string): Promise<JournalEntry[]> {
    if (!query.trim()) return this.getAllEntries();
    const lowerQuery = query.toLowerCase();
    const all = await idbService.getAll('journal');
    const filtered = all.filter(
      (entry) =>
        entry.plainText.toLowerCase().includes(lowerQuery) ||
        entry.title.toLowerCase().includes(lowerQuery) ||
        entry.tags.some((t) => t.toLowerCase().includes(lowerQuery))
    );
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getEntriesByBook(bookId: string): Promise<JournalEntry[]> {
    const entries = await idbService.getAllFromIndex('journal', 'by-bookId', bookId);
    return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async clearAll(): Promise<void> {
    await idbService.clear('journal');
  }
}

export const journalStorage = new JournalStorageService();
