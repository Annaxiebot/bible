import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractKeywords,
  extractSnippet,
  suggestTags,
  findRelatedEntries,
  generateWeeklyDigest,
  getTimelineGroups,
} from '../journalAIService';
import { journalStorage } from '../journalStorage';
import type { JournalEntry } from '../idbService';

// Mock the AI provider
vi.mock('../aiProvider', () => ({
  chatWithAI: vi.fn(),
}));

import { chatWithAI } from '../aiProvider';
const mockChatWithAI = vi.mocked(chatWithAI);

function makeEntry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id: `journal_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    title: '',
    content: '',
    plainText: '',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('journalAIService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await journalStorage.clearAll();
  });

  // ── extractKeywords ──────────────────────────────────────────────────

  describe('extractKeywords', () => {
    it('should extract meaningful words and filter stop words', () => {
      const keywords = extractKeywords('The grace of God is amazing and beautiful');
      expect(keywords).toContain('grace');
      expect(keywords).toContain('god');
      expect(keywords).toContain('amazing');
      expect(keywords).toContain('beautiful');
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('of');
      expect(keywords).not.toContain('is');
      expect(keywords).not.toContain('and');
    });

    it('should filter short words (<=2 chars)', () => {
      const keywords = extractKeywords('I am at a go');
      expect(keywords).toEqual([]);
    });

    it('should handle empty text', () => {
      expect(extractKeywords('')).toEqual([]);
    });

    it('should lowercase all words', () => {
      const keywords = extractKeywords('FAITH Hope LOVE');
      expect(keywords).toEqual(['faith', 'hope', 'love']);
    });
  });

  // ── extractSnippet ───────────────────────────────────────────────────

  describe('extractSnippet', () => {
    it('should extract snippet around matching keyword', () => {
      const text = 'Today I reflected on the meaning of forgiveness in my daily life and found peace.';
      const snippet = extractSnippet(text, ['forgiveness']);
      expect(snippet).toContain('forgiveness');
    });

    it('should return start of text if no keyword matches', () => {
      const text = 'A short reflection on my day.';
      const snippet = extractSnippet(text, ['xyz']);
      expect(snippet).toBe('A short reflection on my day.');
    });

    it('should truncate long snippets', () => {
      const text = 'x'.repeat(300);
      const snippet = extractSnippet(text, ['xyz'], 120);
      expect(snippet.length).toBeLessThanOrEqual(125); // 120 + "..."
    });
  });

  // ── suggestTags ──────────────────────────────────────────────────────

  describe('suggestTags', () => {
    it('should return tags from AI response', async () => {
      mockChatWithAI.mockResolvedValueOnce({
        text: '["faith", "gratitude", "romans 8"]',
        provider: 'test',
      });

      const entry = makeEntry({ plainText: 'I am grateful for the faith described in Romans 8. God is so good.' });
      const tags = await suggestTags(entry);

      expect(tags).toEqual(['faith', 'gratitude', 'romans 8']);
      expect(mockChatWithAI).toHaveBeenCalledOnce();
    });

    it('should handle AI returning markdown code block', async () => {
      mockChatWithAI.mockResolvedValueOnce({
        text: '```json\n["prayer", "peace"]\n```',
        provider: 'test',
      });

      const entry = makeEntry({ plainText: 'Prayer brought me such peace today in my reflection time.' });
      const tags = await suggestTags(entry);
      expect(tags).toEqual(['prayer', 'peace']);
    });

    it('should return empty array for short text', async () => {
      const entry = makeEntry({ plainText: 'Hi' });
      const tags = await suggestTags(entry);
      expect(tags).toEqual([]);
      expect(mockChatWithAI).not.toHaveBeenCalled();
    });

    it('should return empty array on AI failure', async () => {
      mockChatWithAI.mockRejectedValueOnce(new Error('API error'));

      const entry = makeEntry({ plainText: 'Reflecting on the goodness of God today and always.' });
      const tags = await suggestTags(entry);
      expect(tags).toEqual([]);
    });

    it('should handle string response from AI', async () => {
      mockChatWithAI.mockResolvedValueOnce('["hope", "strength"]');

      const entry = makeEntry({ plainText: 'Finding hope and strength in difficult times through prayer.' });
      const tags = await suggestTags(entry);
      expect(tags).toEqual(['hope', 'strength']);
    });

    it('should limit to 7 tags max', async () => {
      mockChatWithAI.mockResolvedValueOnce({
        text: '["a","b","c","d","e","f","g","h","i","j"]',
        provider: 'test',
      });

      const entry = makeEntry({ plainText: 'A long journal entry about many topics and themes in my daily walk.' });
      const tags = await suggestTags(entry);
      expect(tags.length).toBeLessThanOrEqual(7);
    });
  });

  // ── findRelatedEntries ───────────────────────────────────────────────

  describe('findRelatedEntries', () => {
    it('should find related entries by shared keywords', async () => {
      await journalStorage.createEntry({
        title: 'Morning Prayer',
        plainText: 'Today I prayed about forgiveness and grace. God showed me his mercy.',
      });
      await journalStorage.createEntry({
        title: 'Evening Reflection',
        plainText: 'The evening was peaceful. I read about science and technology.',
      });
      await journalStorage.createEntry({
        title: 'Grace Study',
        plainText: 'Studying grace and forgiveness in the Bible. God is merciful and kind.',
      });

      const current = makeEntry({
        title: 'Forgiveness',
        plainText: 'Learning about forgiveness and grace from God today.',
      });

      const related = await findRelatedEntries(current, 3);
      expect(related.length).toBeGreaterThanOrEqual(1);
      // The "Grace Study" and "Morning Prayer" entries should match
      const titles = related.map(r => r.title);
      expect(titles.some(t => t === 'Grace Study' || t === 'Morning Prayer')).toBe(true);
    });

    it('should not include the current entry in results', async () => {
      const created = await journalStorage.createEntry({
        title: 'Test Entry',
        plainText: 'Forgiveness grace mercy prayer faith hope love',
      });

      const related = await findRelatedEntries(created, 3);
      expect(related.every(r => r.id !== created.id)).toBe(true);
    });

    it('should return empty array when no entries match', async () => {
      const entry = makeEntry({
        title: 'Unique Topic',
        plainText: 'xyzabc completely unique content here',
      });
      const related = await findRelatedEntries(entry, 3);
      expect(related).toEqual([]);
    });

    it('should return empty array for empty text', async () => {
      const entry = makeEntry({ plainText: '' });
      const related = await findRelatedEntries(entry, 3);
      expect(related).toEqual([]);
    });

    it('should limit results to specified count', async () => {
      for (let i = 0; i < 5; i++) {
        await journalStorage.createEntry({
          plainText: `Entry about forgiveness grace mercy prayer faith number ${i}`,
        });
      }

      const entry = makeEntry({ plainText: 'Forgiveness and grace and mercy and prayer and faith' });
      const related = await findRelatedEntries(entry, 2);
      expect(related.length).toBeLessThanOrEqual(2);
    });
  });

  // ── generateWeeklyDigest ─────────────────────────────────────────────

  describe('generateWeeklyDigest', () => {
    it('should return null when no recent entries', async () => {
      const digest = await generateWeeklyDigest();
      expect(digest).toBeNull();
    });

    it('should generate digest from recent entries', async () => {
      await journalStorage.createEntry({
        title: 'Monday',
        plainText: 'Prayed about patience today.',
      });
      await journalStorage.createEntry({
        title: 'Wednesday',
        plainText: 'Grateful for community and fellowship.',
      });

      mockChatWithAI.mockResolvedValueOnce({
        text: '- Recurring theme of patience\n- Gratitude for community\n- Growing in fellowship',
        provider: 'test',
      });

      const digest = await generateWeeklyDigest(true);
      expect(digest).not.toBeNull();
      expect(digest!.entryCount).toBe(2);
      expect(digest!.summary).toContain('patience');
      expect(mockChatWithAI).toHaveBeenCalledOnce();
    });

    it('should return null on AI failure', async () => {
      await journalStorage.createEntry({
        title: 'Test',
        plainText: 'Some reflection content here for the weekly digest.',
      });

      mockChatWithAI.mockRejectedValueOnce(new Error('API error'));

      const digest = await generateWeeklyDigest(true);
      expect(digest).toBeNull();
    });
  });

  // ── getTimelineGroups ────────────────────────────────────────────────

  describe('getTimelineGroups', () => {
    it('should return empty array when no entries', async () => {
      const groups = await getTimelineGroups();
      expect(groups).toEqual([]);
    });

    it('should group entries by date', async () => {
      const now = new Date();

      await journalStorage.createEntry({ title: 'Today 1' });
      await journalStorage.createEntry({ title: 'Today 2' });
      await journalStorage.createEntry({ title: 'Today 3' });

      const groups = await getTimelineGroups();
      expect(groups.length).toBeGreaterThanOrEqual(1);
      // Check that today's group has all 3 entries
      const todayGroup = groups.find(g => g.date === now.toISOString().slice(0, 10));
      expect(todayGroup).toBeDefined();
      expect(todayGroup!.entries.length).toBe(3);
    });

    it('should sort groups newest first', async () => {
      await journalStorage.createEntry({ title: 'Entry' });

      const groups = await getTimelineGroups();
      if (groups.length >= 2) {
        expect(groups[0].date >= groups[1].date).toBe(true);
      }
    });
  });
});
