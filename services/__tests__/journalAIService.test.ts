import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  extractKeywords,
  extractSnippet,
  suggestTags,
  findRelatedEntries,
  generateWeeklyDigest,
  getTimelineGroups,
  generateReflectionPrompt,
  extendThinking,
  summarizeEntry,
  findRelatedScripture,
  chatAboutEntry,
  extractMemoryItems,
  getMemoryContext,
  generateSpiritualProfile,
  generateProactiveSuggestion,
} from '../journalAIService';
import { journalStorage } from '../journalStorage';
import { spiritualMemory } from '../spiritualMemory';
import type { JournalEntry, SpiritualMemoryItem } from '../idbService';
import { AskAIError, signInNeededError } from '../../components/studypack/askAIErrors';

// The journal's AI goes through the personal app's one AI path (services/studyAI, role 'study').
const { mockStreamStudyAI } = vi.hoisted(() => ({
  mockStreamStudyAI: vi.fn(),
}));

vi.mock('../studyAI', () => ({
  chatStudyAI: vi.fn(),
  streamStudyAI: mockStreamStudyAI,
}));

import { chatStudyAI } from '../studyAI';
const mockChatStudyAI = vi.mocked(chatStudyAI);

/** Helper: the stream emits `text` and resolves with it */
function mockStreamResponse(text: string) {
  mockStreamStudyAI.mockImplementationOnce(
    async (_prompt: string, _history: unknown[], onChunk: (t: string) => void) => {
      onChunk(text);
      return { text, model: 'test-model' };
    }
  );
}

function mockStreamError(error: Error) {
  mockStreamStudyAI.mockRejectedValueOnce(error);
}

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
      mockChatStudyAI.mockResolvedValueOnce({
        text: '["faith", "gratitude", "romans 8"]',
        model: 'test-model',
      });

      const entry = makeEntry({ plainText: 'I am grateful for the faith described in Romans 8. God is so good.' });
      const tags = await suggestTags(entry);

      expect(tags).toEqual(['faith', 'gratitude', 'romans 8']);
      expect(mockChatStudyAI).toHaveBeenCalledOnce();
    });

    it('should handle AI returning markdown code block', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: '```json\n["prayer", "peace"]\n```',
        model: 'test-model',
      });

      const entry = makeEntry({ plainText: 'Prayer brought me such peace today in my reflection time.' });
      const tags = await suggestTags(entry);
      expect(tags).toEqual(['prayer', 'peace']);
    });

    it('should return empty array for short text', async () => {
      const entry = makeEntry({ plainText: 'Hi' });
      const tags = await suggestTags(entry);
      expect(tags).toEqual([]);
      expect(mockChatStudyAI).not.toHaveBeenCalled();
    });

    it('rethrows the typed AI failure (the caller decides; never swallowed here)', async () => {
      const failure = signInNeededError('m');
      mockChatStudyAI.mockRejectedValueOnce(failure);

      const entry = makeEntry({ plainText: 'Reflecting on the goodness of God today and always.' });
      await expect(suggestTags(entry)).rejects.toBe(failure);
    });

    it('a malformed JSON reply is "no tags", not a failure', async () => {
      mockChatStudyAI.mockResolvedValueOnce({ text: '["faith", oops]', model: 'test-model' });
      const entry = makeEntry({ plainText: 'Reflecting on the goodness of God today and always.' });
      expect(await suggestTags(entry)).toEqual([]);
    });

    it('should handle string response from AI', async () => {
      mockChatStudyAI.mockResolvedValueOnce({ text: '["hope", "strength"]', model: 'test-model' });

      const entry = makeEntry({ plainText: 'Finding hope and strength in difficult times through prayer.' });
      const tags = await suggestTags(entry);
      expect(tags).toEqual(['hope', 'strength']);
    });

    it('should limit to 7 tags max', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: '["a","b","c","d","e","f","g","h","i","j"]',
        model: 'test-model',
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

      mockChatStudyAI.mockResolvedValueOnce({
        text: '- Recurring theme of patience\n- Gratitude for community\n- Growing in fellowship',
        model: 'test-model',
      });

      const digest = await generateWeeklyDigest(true);
      expect(digest).not.toBeNull();
      expect(digest!.entryCount).toBe(2);
      expect(digest!.summary).toContain('patience');
      expect(mockChatStudyAI).toHaveBeenCalledOnce();
    });

    it('rethrows the typed AI failure (quota), so the digest panel can show it', async () => {
      await journalStorage.createEntry({
        title: 'Test',
        plainText: 'Some reflection content here for the weekly digest.',
      });

      const failure = new AskAIError('quota', 'quota line', 'm', 429);
      mockChatStudyAI.mockRejectedValueOnce(failure);

      await expect(generateWeeklyDigest(true)).rejects.toBe(failure);
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

  // ── generateReflectionPrompt ────────────────────────────────────────

  describe('generateReflectionPrompt', () => {
    it('should generate a prompt from current entry and Bible context', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: 'What does grace mean to you in this season of life?',
        model: 'test-model',
      });

      const entry = makeEntry({ plainText: 'Thinking about grace and forgiveness today.' });
      const result = await generateReflectionPrompt(
        entry,
        { bookId: 'ROM', chapter: 8, bookName: 'Romans' },
        []
      );

      expect(result).toBe('What does grace mean to you in this season of life?');
      expect(mockChatStudyAI).toHaveBeenCalledOnce();
    });

    it('should work with no entry and no context', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: 'What is on your heart today?',
        model: 'test-model',
      });

      const result = await generateReflectionPrompt(null, null, []);
      expect(result).toBe('What is on your heart today?');
    });

    it('rethrows on AI failure (no canned fallback prompt)', async () => {
      const failure = signInNeededError('m');
      mockChatStudyAI.mockRejectedValueOnce(failure);
      await expect(generateReflectionPrompt(null, null, [])).rejects.toBe(failure);
    });
  });

  // ── extendThinking ──────────────────────────────────────────────────

  describe('extendThinking', () => {
    it('should extend the user text', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: 'This connects to a broader theme of surrender...',
        model: 'test-model',
      });

      const result = await extendThinking('Letting go of control is hard.');
      expect(result).toBe('This connects to a broader theme of surrender...');
      expect(mockChatStudyAI).toHaveBeenCalledOnce();
    });

    it('should return empty string for empty text', async () => {
      const result = await extendThinking('');
      expect(result).toBe('');
      expect(mockChatStudyAI).not.toHaveBeenCalled();
    });

    it('rethrows on AI failure', async () => {
      const failure = signInNeededError('m');
      mockChatStudyAI.mockRejectedValueOnce(failure);
      await expect(extendThinking('Some text here about faith.')).rejects.toBe(failure);
    });
  });

  // ── summarizeEntry ──────────────────────────────────────────────────

  describe('summarizeEntry', () => {
    it('should summarize entry text', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: '- Finding peace through prayer\n- Learning to trust God',
        model: 'test-model',
      });

      const result = await summarizeEntry('A long journal entry about finding peace through prayer and trusting God in difficult times.');
      expect(result).toContain('peace');
      expect(mockChatStudyAI).toHaveBeenCalledOnce();
    });

    it('should return empty for short text', async () => {
      const result = await summarizeEntry('Hi');
      expect(result).toBe('');
      expect(mockChatStudyAI).not.toHaveBeenCalled();
    });

    it('rethrows on AI failure', async () => {
      const failure = signInNeededError('m');
      mockChatStudyAI.mockRejectedValueOnce(failure);
      await expect(summarizeEntry('A moderately long entry about spiritual growth and transformation.')).rejects.toBe(failure);
    });
  });

  // ── findRelatedScripture ────────────────────────────────────────────

  describe('findRelatedScripture', () => {
    it('should return scripture suggestions', async () => {
      mockStreamResponse('[{"reference":"Philippians 4:6-7","reason":"About finding peace through prayer."},{"reference":"Psalm 23:1","reason":"God as shepherd and provider."}]');

      const { results } = await findRelatedScripture('I prayed for peace today and felt God providing.');
      expect(results).toHaveLength(2);
      expect(results[0].reference).toBe('Philippians 4:6-7');
      expect(results[0].reason).toContain('peace');
    });

    it('should return empty for short text', async () => {
      const { results } = await findRelatedScripture('Hi');
      expect(results).toEqual([]);
    });

    it('should handle malformed AI response with regex fallback', async () => {
      mockStreamResponse('Here are some verses: Psalm 23:1, Romans 8:28 are relevant.');

      const { results } = await findRelatedScripture('I need guidance and peace today in my spiritual walk.');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].reference).toMatch(/Psalm 23:1|Romans 8:28/);
    });

    it('rethrows the typed AI failure', async () => {
      const failure = signInNeededError('m');
      mockStreamError(failure);
      await expect(findRelatedScripture('Looking for peace and comfort today.')).rejects.toBe(failure);
    });

    it('a reply with no references is an empty result (the UI says "none found"), not a failure', async () => {
      mockStreamResponse('I could not think of anything specific.');
      const { results } = await findRelatedScripture('Looking for peace and comfort today.');
      expect(results).toEqual([]);
    });

    it('should limit to 5 results', async () => {
      mockStreamResponse(JSON.stringify(
        Array.from({ length: 8 }, (_, i) => ({ reference: `Verse ${i}`, reason: `Reason ${i}` }))
      ));

      const { results } = await findRelatedScripture('A rich journal entry with many themes and ideas to explore.');
      expect(results.length).toBeLessThanOrEqual(5);
    });

    it('should return meta with model and timestamp', async () => {
      mockStreamResponse('[{"reference":"John 3:16","reason":"God\'s love."}]');

      const { meta } = await findRelatedScripture('God loved the world so much today I felt grateful.');
      expect(meta.model).toBe('test-model');
      expect(meta.timestamp).toBeDefined();
    });
  });

  // ── chatAboutEntry ──────────────────────────────────────────────────

  describe('chatAboutEntry', () => {
    it('should return AI answer', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: 'That is a wonderful question. Grace means...',
        model: 'test-model',
      });

      const answer = await chatAboutEntry(
        'What does grace mean?',
        'Today I reflected on grace.',
        []
      );
      expect(answer).toContain('Grace means');
    });

    it('should return empty for empty question', async () => {
      const answer = await chatAboutEntry('', 'some content', []);
      expect(answer).toBe('');
      expect(mockChatStudyAI).not.toHaveBeenCalled();
    });

    it('rethrows on AI failure (no canned apology)', async () => {
      const failure = signInNeededError('m');
      mockChatStudyAI.mockRejectedValueOnce(failure);
      await expect(chatAboutEntry('Help me understand this passage about faith.', 'some content', [])).rejects.toBe(failure);
    });
  });

  // ── extractMemoryItems ──────────────────────────────────────────────

  describe('extractMemoryItems', () => {
    beforeEach(async () => {
      await spiritualMemory.clearAll();
    });

    it('should extract and save memory items', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: '[{"category":"theme","content":"Forgiveness"},{"category":"prayer","content":"Praying for healing"}]',
        model: 'test-model',
      });

      const items = await extractMemoryItems(
        'Today I reflected deeply on forgiveness and prayed for healing for my mother.',
        'entry123'
      );
      expect(items).toHaveLength(2);
      expect(items[0].category).toBe('theme');
      expect(items[1].category).toBe('prayer');

      // Verify saved to spiritualMemory store
      const saved = await spiritualMemory.getAllItems();
      expect(saved.length).toBe(2);
      expect(saved.some(s => s.content === 'Forgiveness')).toBe(true);
    });

    it('should return empty for short text', async () => {
      const items = await extractMemoryItems('Hi');
      expect(items).toEqual([]);
    });

    it('rethrows on AI failure and saves nothing', async () => {
      const failure = signInNeededError('m');
      mockChatStudyAI.mockRejectedValueOnce(failure);
      await expect(extractMemoryItems('A moderately long entry about spiritual growth and learning.')).rejects.toBe(failure);
      expect(await spiritualMemory.getAllItems()).toEqual([]);
    });

    it('should filter invalid categories', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: '[{"category":"theme","content":"Grace"},{"category":"invalid","content":"Bad"}]',
        model: 'test-model',
      });

      const items = await extractMemoryItems('Reflecting on the grace of God in this time of testing and growth.');
      expect(items).toHaveLength(1);
      expect(items[0].category).toBe('theme');
    });
  });

  // ── getMemoryContext ────────────────────────────────────────────────

  describe('getMemoryContext', () => {
    beforeEach(async () => {
      await spiritualMemory.clearAll();
    });

    it('should return all memory items', async () => {
      await spiritualMemory.addItem({ category: 'theme', content: 'Forgiveness' });
      await spiritualMemory.addItem({ category: 'prayer', content: 'Healing' });

      const items = await getMemoryContext();
      expect(items).toHaveLength(2);
    });

    it('should return empty when no items', async () => {
      const items = await getMemoryContext();
      expect(items).toEqual([]);
    });
  });

  // ── generateSpiritualProfile ────────────────────────────────────────

  describe('generateSpiritualProfile', () => {
    it('should generate profile from memory items', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: '**Key Themes**: Forgiveness, Grace\n**Active Prayer Requests**: Healing for mother',
        model: 'test-model',
      });

      const items: SpiritualMemoryItem[] = [
        { id: '1', category: 'theme', content: 'Forgiveness', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: '2', category: 'prayer', content: 'Healing for mother', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      const profile = await generateSpiritualProfile(items);
      expect(profile).toContain('Forgiveness');
      expect(mockChatStudyAI).toHaveBeenCalledOnce();
    });

    it('should return default message when no items', async () => {
      const profile = await generateSpiritualProfile([]);
      expect(profile).toContain('No spiritual memory');
      expect(mockChatStudyAI).not.toHaveBeenCalled();
    });

    it('rethrows on AI failure', async () => {
      const failure = new AskAIError('quota', 'quota line', 'm', 429);
      mockChatStudyAI.mockRejectedValueOnce(failure);

      const items: SpiritualMemoryItem[] = [
        { id: '1', category: 'theme', content: 'Grace', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      await expect(generateSpiritualProfile(items)).rejects.toBe(failure);
    });
  });

  // ── generateProactiveSuggestion ─────────────────────────────────────

  describe('generateProactiveSuggestion', () => {
    it('should generate suggestion with context', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: 'You mentioned wanting to study forgiveness — consider reading Colossians 3:13 today.',
        model: 'test-model',
      });

      const items: SpiritualMemoryItem[] = [
        { id: '1', category: 'theme', content: 'Forgiveness', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      const lastEntry = makeEntry({ plainText: 'I want to learn more about forgiveness.', createdAt: new Date(Date.now() - 2 * 86400000).toISOString() });

      const suggestion = await generateProactiveSuggestion(items, lastEntry, { bookId: 'COL', chapter: 3, bookName: 'Colossians' });
      expect(suggestion).toContain('forgiveness');
    });

    it('should work with no context', async () => {
      mockChatStudyAI.mockResolvedValueOnce({
        text: 'Welcome! Consider starting with what you are grateful for.',
        model: 'test-model',
      });

      const suggestion = await generateProactiveSuggestion([], null, null);
      expect(suggestion).toContain('grateful');
    });

    it('rethrows on AI failure (the caller stays silent with an R5 comment)', async () => {
      const failure = signInNeededError('m');
      mockChatStudyAI.mockRejectedValueOnce(failure);
      await expect(generateProactiveSuggestion([], null, null)).rejects.toBe(failure);
    });
  });
});
