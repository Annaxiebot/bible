import { describe, it, expect, beforeEach } from 'vitest';
import {
  createThread,
  getThread,
  getAllThreads,
  loadThreadMessages,
  saveThreadMessages,
  deleteThread,
  clearAllThreads,
  getOrCreateChapterThread,
} from '../chatHistoryStorage';
import { ChatMessage } from '../../types';

describe('chatHistoryStorage', () => {
  beforeEach(async () => {
    await clearAllThreads();
  });

  const makeMsg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
    role,
    content,
    timestamp: new Date(),
  });

  describe('createThread', () => {
    it('creates a thread with a UUID id', async () => {
      const thread = await createThread();
      expect(thread.id).toBeTruthy();
      expect(thread.title).toBe('New Chat');
      expect(thread.messages).toEqual([]);
      expect(thread.createdAt).toBeTruthy();
    });

    it('creates a thread linked to a chapter', async () => {
      const thread = await createThread({ bookId: 'GEN', chapter: 1 });
      expect(thread.bookId).toBe('GEN');
      expect(thread.chapter).toBe(1);
    });
  });

  describe('saveThreadMessages + loadThreadMessages', () => {
    it('round-trips messages', async () => {
      const thread = await createThread();
      const messages: ChatMessage[] = [
        makeMsg('user', 'What does Genesis 1:1 mean?'),
        makeMsg('assistant', 'It describes creation.'),
      ];

      await saveThreadMessages(thread.id, messages);
      const loaded = await loadThreadMessages(thread.id);

      expect(loaded).toHaveLength(2);
      expect(loaded[0].role).toBe('user');
      expect(loaded[0].content).toBe('What does Genesis 1:1 mean?');
      expect(loaded[1].content).toBe('It describes creation.');
      expect(loaded[0].timestamp).toBeInstanceOf(Date);
    });

    it('auto-generates title from first user message', async () => {
      const thread = await createThread();
      await saveThreadMessages(thread.id, [makeMsg('user', 'Explain the Sermon on the Mount')]);
      const updated = await getThread(thread.id);
      expect(updated?.title).toBe('Explain the Sermon on the Mount');
    });

    it('preserves optional fields (model, responseTime, references)', async () => {
      const thread = await createThread();
      const msg: ChatMessage = {
        role: 'assistant',
        content: 'answer',
        timestamp: new Date(),
        model: 'gpt-4',
        responseTime: 1234,
        references: [{ title: 'Source', uri: 'https://example.com' }],
      };

      await saveThreadMessages(thread.id, [msg]);
      const loaded = await loadThreadMessages(thread.id);

      expect(loaded[0].model).toBe('gpt-4');
      expect(loaded[0].responseTime).toBe(1234);
      expect(loaded[0].references).toEqual([{ title: 'Source', uri: 'https://example.com' }]);
    });
  });

  describe('getAllThreads', () => {
    it('returns threads sorted by lastModified descending', async () => {
      const t1 = await createThread();
      const t2 = await createThread();
      // Save to t2 so it gets a newer lastModified
      await saveThreadMessages(t2.id, [makeMsg('user', 'newer')]);
      const all = await getAllThreads();
      expect(all[0].id).toBe(t2.id);
      expect(all[1].id).toBe(t1.id);
    });
  });

  describe('deleteThread', () => {
    it('removes a specific thread', async () => {
      const t1 = await createThread();
      const t2 = await createThread();
      await deleteThread(t1.id);

      const all = await getAllThreads();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(t2.id);
    });
  });

  describe('clearAllThreads', () => {
    it('removes all threads', async () => {
      await createThread();
      await createThread();
      await clearAllThreads();
      expect(await getAllThreads()).toEqual([]);
    });
  });

  describe('getOrCreateChapterThread', () => {
    it('creates a new thread for a chapter', async () => {
      const thread = await getOrCreateChapterThread('GEN', 1);
      expect(thread.bookId).toBe('GEN');
      expect(thread.chapter).toBe(1);
    });

    it('returns existing thread on second call', async () => {
      const t1 = await getOrCreateChapterThread('GEN', 1);
      const t2 = await getOrCreateChapterThread('GEN', 1);
      expect(t1.id).toBe(t2.id);
    });
  });
});
