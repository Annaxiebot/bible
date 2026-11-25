import { describe, it, expect, beforeEach } from 'vitest';
import { spiritualMemory } from '../spiritualMemory';

describe('spiritualMemory', () => {
  beforeEach(async () => {
    await spiritualMemory.clearAll();
  });

  describe('addItem', () => {
    it('should create a memory item', async () => {
      const item = await spiritualMemory.addItem({
        category: 'theme',
        content: 'Forgiveness',
        source: 'entry_123',
      });

      expect(item.id).toBeTruthy();
      expect(item.category).toBe('theme');
      expect(item.content).toBe('Forgiveness');
      expect(item.source).toBe('entry_123');
      expect(item.createdAt).toBeTruthy();
      expect(item.updatedAt).toBeTruthy();
    });

    it('should create items with different categories', async () => {
      await spiritualMemory.addItem({ category: 'theme', content: 'Grace' });
      await spiritualMemory.addItem({ category: 'prayer', content: 'Healing for Mom' });
      await spiritualMemory.addItem({ category: 'growth', content: 'Patience' });
      await spiritualMemory.addItem({ category: 'question', content: 'Why suffering?' });

      const all = await spiritualMemory.getAllItems();
      expect(all).toHaveLength(4);
    });
  });

  describe('getItem', () => {
    it('should retrieve an item by id', async () => {
      const created = await spiritualMemory.addItem({ category: 'prayer', content: 'Peace' });
      const retrieved = await spiritualMemory.getItem(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.content).toBe('Peace');
    });

    it('should return null for non-existent id', async () => {
      const result = await spiritualMemory.getItem('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateItem', () => {
    it('should update content and category', async () => {
      const item = await spiritualMemory.addItem({ category: 'theme', content: 'Old theme' });
      // Ensure different timestamp
      await new Promise(r => setTimeout(r, 10));
      const updated = await spiritualMemory.updateItem(item.id, { content: 'New theme', category: 'growth' });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('New theme');
      expect(updated!.category).toBe('growth');
      expect(updated!.createdAt).toBe(item.createdAt);
      expect(updated!.updatedAt).not.toBe(item.updatedAt);
    });

    it('should return null for non-existent id', async () => {
      const result = await spiritualMemory.updateItem('nonexistent', { content: 'Test' });
      expect(result).toBeNull();
    });
  });

  describe('deleteItem', () => {
    it('should delete an item', async () => {
      const item = await spiritualMemory.addItem({ category: 'theme', content: 'To delete' });
      await spiritualMemory.deleteItem(item.id);

      const result = await spiritualMemory.getItem(item.id);
      expect(result).toBeNull();
    });
  });

  describe('getAllItems', () => {
    it('should return all items sorted newest first', async () => {
      await spiritualMemory.addItem({ category: 'theme', content: 'First' });
      // Ensure different timestamps
      await new Promise(r => setTimeout(r, 10));
      await spiritualMemory.addItem({ category: 'prayer', content: 'Second' });

      const all = await spiritualMemory.getAllItems();
      expect(all).toHaveLength(2);
      expect(all[0].content).toBe('Second');
      expect(all[1].content).toBe('First');
    });

    it('should return empty array when no items', async () => {
      const all = await spiritualMemory.getAllItems();
      expect(all).toEqual([]);
    });
  });

  describe('getItemsByCategory', () => {
    it('should filter by category', async () => {
      await spiritualMemory.addItem({ category: 'theme', content: 'Grace' });
      await spiritualMemory.addItem({ category: 'prayer', content: 'Healing' });
      await spiritualMemory.addItem({ category: 'theme', content: 'Forgiveness' });

      const themes = await spiritualMemory.getItemsByCategory('theme');
      expect(themes).toHaveLength(2);
      expect(themes.every(t => t.category === 'theme')).toBe(true);

      const prayers = await spiritualMemory.getItemsByCategory('prayer');
      expect(prayers).toHaveLength(1);
    });
  });

  describe('getItemsBySource', () => {
    it('should filter by source entry id', async () => {
      await spiritualMemory.addItem({ category: 'theme', content: 'Grace', source: 'entry_1' });
      await spiritualMemory.addItem({ category: 'prayer', content: 'Healing', source: 'entry_1' });
      await spiritualMemory.addItem({ category: 'theme', content: 'Love', source: 'entry_2' });

      const fromEntry1 = await spiritualMemory.getItemsBySource('entry_1');
      expect(fromEntry1).toHaveLength(2);
      expect(fromEntry1.every(i => i.source === 'entry_1')).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should remove all items', async () => {
      await spiritualMemory.addItem({ category: 'theme', content: 'A' });
      await spiritualMemory.addItem({ category: 'prayer', content: 'B' });

      await spiritualMemory.clearAll();

      const all = await spiritualMemory.getAllItems();
      expect(all).toEqual([]);
    });
  });
});
