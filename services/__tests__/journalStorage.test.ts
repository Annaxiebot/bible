import { describe, it, expect, beforeEach } from 'vitest';
import { journalStorage } from '../journalStorage';

describe('journalStorage', () => {
  beforeEach(async () => {
    await journalStorage.clearAll();
  });

  describe('createEntry', () => {
    it('should create an entry with default values', async () => {
      const entry = await journalStorage.createEntry({});
      expect(entry.id).toMatch(/^journal_/);
      expect(entry.title).toBe('');
      expect(entry.content).toBe('');
      expect(entry.plainText).toBe('');
      expect(entry.tags).toEqual([]);
      expect(entry.createdAt).toBeTruthy();
      expect(entry.updatedAt).toBeTruthy();
    });

    it('should create an entry with provided values', async () => {
      const entry = await journalStorage.createEntry({
        title: 'My Reflection',
        content: '<p>Hello</p>',
        plainText: 'Hello',
        bookId: 'GEN',
        chapter: 1,
        verseRef: 'Genesis 1',
        tags: ['prayer', 'morning'],
      });
      expect(entry.title).toBe('My Reflection');
      expect(entry.content).toBe('<p>Hello</p>');
      expect(entry.plainText).toBe('Hello');
      expect(entry.bookId).toBe('GEN');
      expect(entry.chapter).toBe(1);
      expect(entry.verseRef).toBe('Genesis 1');
      expect(entry.tags).toEqual(['prayer', 'morning']);
    });
  });

  describe('getEntry', () => {
    it('should return null for non-existent entry', async () => {
      const result = await journalStorage.getEntry('nonexistent');
      expect(result).toBeNull();
    });

    it('should return the created entry', async () => {
      const created = await journalStorage.createEntry({ title: 'Test' });
      const fetched = await journalStorage.getEntry(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('Test');
    });
  });

  describe('updateEntry', () => {
    it('should update fields and set updatedAt', async () => {
      const created = await journalStorage.createEntry({ title: 'Before' });
      const originalUpdatedAt = created.updatedAt;

      // Small delay so updatedAt differs
      await new Promise((r) => setTimeout(r, 10));

      const updated = await journalStorage.updateEntry(created.id, { title: 'After', content: '<p>New</p>' });
      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('After');
      expect(updated!.content).toBe('<p>New</p>');
      expect(updated!.createdAt).toBe(created.createdAt); // unchanged
      expect(updated!.updatedAt >= originalUpdatedAt).toBe(true);
    });

    it('should return null for non-existent entry', async () => {
      const result = await journalStorage.updateEntry('nonexistent', { title: 'X' });
      expect(result).toBeNull();
    });
  });

  describe('deleteEntry', () => {
    it('should delete an entry', async () => {
      const created = await journalStorage.createEntry({ title: 'ToDelete' });
      await journalStorage.deleteEntry(created.id);
      const result = await journalStorage.getEntry(created.id);
      expect(result).toBeNull();
    });
  });

  describe('getAllEntries', () => {
    it('should return all entries sorted newest first', async () => {
      const e1 = await journalStorage.createEntry({ title: 'First' });
      await new Promise((r) => setTimeout(r, 10));
      const e2 = await journalStorage.createEntry({ title: 'Second' });

      const all = await journalStorage.getAllEntries();
      expect(all.length).toBe(2);
      expect(all[0].id).toBe(e2.id);
      expect(all[1].id).toBe(e1.id);
    });

    it('should return empty array when no entries', async () => {
      const all = await journalStorage.getAllEntries();
      expect(all).toEqual([]);
    });
  });

  describe('searchEntries', () => {
    it('should find entries by plainText', async () => {
      await journalStorage.createEntry({ plainText: 'God is good' });
      await journalStorage.createEntry({ plainText: 'Morning prayer' });

      const results = await journalStorage.searchEntries('good');
      expect(results.length).toBe(1);
      expect(results[0].plainText).toBe('God is good');
    });

    it('should find entries by title', async () => {
      await journalStorage.createEntry({ title: 'Sunday Reflection' });
      await journalStorage.createEntry({ title: 'Monday Notes' });

      const results = await journalStorage.searchEntries('reflection');
      expect(results.length).toBe(1);
    });

    it('should find entries by tags', async () => {
      await journalStorage.createEntry({ tags: ['prayer', 'morning'] });
      await journalStorage.createEntry({ tags: ['study'] });

      const results = await journalStorage.searchEntries('prayer');
      expect(results.length).toBe(1);
    });

    it('should return all entries for empty query', async () => {
      await journalStorage.createEntry({ title: 'A' });
      await journalStorage.createEntry({ title: 'B' });

      const results = await journalStorage.searchEntries('');
      expect(results.length).toBe(2);
    });

    it('should be case insensitive', async () => {
      await journalStorage.createEntry({ plainText: 'GRACE and mercy' });

      const results = await journalStorage.searchEntries('grace');
      expect(results.length).toBe(1);
    });
  });

  describe('getEntriesByBook', () => {
    it('should return entries for a specific book', async () => {
      await journalStorage.createEntry({ bookId: 'GEN', title: 'Genesis note' });
      await journalStorage.createEntry({ bookId: 'EXO', title: 'Exodus note' });
      await journalStorage.createEntry({ bookId: 'GEN', title: 'Another Genesis' });

      const results = await journalStorage.getEntriesByBook('GEN');
      expect(results.length).toBe(2);
      expect(results.every((e) => e.bookId === 'GEN')).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should remove all entries', async () => {
      await journalStorage.createEntry({ title: 'A' });
      await journalStorage.createEntry({ title: 'B' });
      await journalStorage.clearAll();

      const all = await journalStorage.getAllEntries();
      expect(all.length).toBe(0);
    });
  });
});
