/**
 * spiritualMemory.ts
 *
 * Persistent memory service for the Personal Agent (Phase 4).
 * Stores key insights about the user: themes, prayer requests, growth areas, questions.
 * Backed by IndexedDB via idbService.
 */

import { idbService, SpiritualMemoryItem } from './idbService';

function generateId(): string {
  return `mem_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

class SpiritualMemoryService {
  async addItem(params: {
    category: SpiritualMemoryItem['category'];
    content: string;
    source?: string;
  }): Promise<SpiritualMemoryItem> {
    const now = new Date().toISOString();
    const item: SpiritualMemoryItem = {
      id: generateId(),
      category: params.category,
      content: params.content,
      source: params.source,
      createdAt: now,
      updatedAt: now,
    };
    await idbService.put('spiritualMemory', item);
    return item;
  }

  async updateItem(
    id: string,
    updates: Partial<Pick<SpiritualMemoryItem, 'content' | 'category'>>
  ): Promise<SpiritualMemoryItem | null> {
    const existing = await idbService.get('spiritualMemory', id);
    if (!existing) return null;
    const updated: SpiritualMemoryItem = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await idbService.put('spiritualMemory', updated);
    return updated;
  }

  async deleteItem(id: string): Promise<void> {
    await idbService.delete('spiritualMemory', id);
  }

  async getItem(id: string): Promise<SpiritualMemoryItem | null> {
    const item = await idbService.get('spiritualMemory', id);
    return item ?? null;
  }

  async getAllItems(): Promise<SpiritualMemoryItem[]> {
    const all = await idbService.getAll('spiritualMemory');
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getItemsByCategory(
    category: SpiritualMemoryItem['category']
  ): Promise<SpiritualMemoryItem[]> {
    const all = await idbService.getAllFromIndex('spiritualMemory', 'by-category', category);
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getItemsBySource(entryId: string): Promise<SpiritualMemoryItem[]> {
    const all = await idbService.getAll('spiritualMemory');
    return all.filter(item => item.source === entryId);
  }

  async clearAll(): Promise<void> {
    await idbService.clear('spiritualMemory');
  }
}

export const spiritualMemory = new SpiritualMemoryService();
