import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadChatHistory,
  saveChatHistory,
  clearChatHistory,
  clearAllChatHistory,
  chatHistoryKey,
} from '../chatHistoryStorage';
import { ChatMessage } from '../../types';

describe('chatHistoryStorage', () => {
  beforeEach(async () => {
    await clearAllChatHistory();
  });

  const makeMsg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
    role,
    content,
    timestamp: new Date(),
  });

  describe('chatHistoryKey', () => {
    it('builds a composite key from bookId and chapter', () => {
      expect(chatHistoryKey('GEN', 1)).toBe('GEN:1');
      expect(chatHistoryKey('PSA', 119)).toBe('PSA:119');
    });
  });

  describe('saveChatHistory + loadChatHistory', () => {
    it('round-trips messages for a chapter', async () => {
      const messages: ChatMessage[] = [
        makeMsg('user', 'What does Genesis 1:1 mean?'),
        makeMsg('assistant', 'It describes creation.'),
      ];

      await saveChatHistory('GEN', 1, messages);
      const loaded = await loadChatHistory('GEN', 1);

      expect(loaded).toHaveLength(2);
      expect(loaded[0].role).toBe('user');
      expect(loaded[0].content).toBe('What does Genesis 1:1 mean?');
      expect(loaded[1].role).toBe('assistant');
      expect(loaded[1].content).toBe('It describes creation.');
      // Timestamps should be Date objects after deserialisation
      expect(loaded[0].timestamp).toBeInstanceOf(Date);
    });

    it('returns empty array when no history exists', async () => {
      const loaded = await loadChatHistory('REV', 22);
      expect(loaded).toEqual([]);
    });

    it('overwrites previous data on second save', async () => {
      await saveChatHistory('GEN', 1, [makeMsg('user', 'first')]);
      await saveChatHistory('GEN', 1, [makeMsg('user', 'second'), makeMsg('assistant', 'reply')]);

      const loaded = await loadChatHistory('GEN', 1);
      expect(loaded).toHaveLength(2);
      expect(loaded[0].content).toBe('second');
    });

    it('preserves optional fields (model, responseTime, references)', async () => {
      const msg: ChatMessage = {
        role: 'assistant',
        content: 'answer',
        timestamp: new Date(),
        model: 'gpt-4',
        responseTime: 1234,
        references: [{ title: 'Source', uri: 'https://example.com' }],
      };

      await saveChatHistory('PSA', 23, [msg]);
      const loaded = await loadChatHistory('PSA', 23);

      expect(loaded[0].model).toBe('gpt-4');
      expect(loaded[0].responseTime).toBe(1234);
      expect(loaded[0].references).toEqual([{ title: 'Source', uri: 'https://example.com' }]);
    });
  });

  describe('clearChatHistory', () => {
    it('removes history for a specific chapter', async () => {
      await saveChatHistory('GEN', 1, [makeMsg('user', 'hello')]);
      await saveChatHistory('GEN', 2, [makeMsg('user', 'world')]);

      await clearChatHistory('GEN', 1);

      expect(await loadChatHistory('GEN', 1)).toEqual([]);
      expect(await loadChatHistory('GEN', 2)).toHaveLength(1);
    });
  });

  describe('clearAllChatHistory', () => {
    it('removes all chat threads', async () => {
      await saveChatHistory('GEN', 1, [makeMsg('user', 'a')]);
      await saveChatHistory('EXO', 5, [makeMsg('user', 'b')]);

      await clearAllChatHistory();

      expect(await loadChatHistory('GEN', 1)).toEqual([]);
      expect(await loadChatHistory('EXO', 5)).toEqual([]);
    });
  });

  describe('saveChatHistory with empty array', () => {
    it('clears stored data when saving empty messages', async () => {
      await saveChatHistory('GEN', 1, [makeMsg('user', 'hello')]);
      await saveChatHistory('GEN', 1, []);

      expect(await loadChatHistory('GEN', 1)).toEqual([]);
    });
  });
});
