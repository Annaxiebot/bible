import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FREE_MODELS, PREMIUM_MODELS, testApiKey, chatWithAI } from '../openrouter';
import { STORAGE_KEYS } from '../../constants/storageKeys';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => Object.keys(store).forEach(k => delete store[k]),
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

describe('openrouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
  });

  describe('model constants', () => {
    it('exports free models with required fields', () => {
      expect(FREE_MODELS.length).toBeGreaterThan(0);
      FREE_MODELS.forEach(model => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
      });
    });

    it('exports premium models with required fields', () => {
      expect(PREMIUM_MODELS.length).toBeGreaterThan(0);
      PREMIUM_MODELS.forEach(model => {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
      });
    });
  });

  describe('testApiKey', () => {
    it('returns success when API responds OK', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: 'google/gemini-flash-1.5', choices: [{ message: { content: 'Works!' } }] }),
      });

      const result = await testApiKey('sk-test-key');
      expect(result.success).toBe(true);
      expect(result.model).toBe('google/gemini-flash-1.5');
    });

    it('returns error when API responds with error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      const result = await testApiKey('sk-bad-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid API key');
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await testApiKey('sk-test-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('handles non-Error throw', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await testApiKey('sk-test-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
    });

    it('falls back to HTTP status when no error message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      });

      const result = await testApiKey('sk-test-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('HTTP 500: Internal Server Error');
    });
  });

  describe('chatWithAI', () => {
    it('throws when no API key configured', async () => {
      await expect(chatWithAI('Hello', [])).rejects.toThrow('OpenRouter API key not configured');
    });

    it('sends correct request and returns response', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'AI response' } }] }),
      });

      const result = await chatWithAI('Hello', []);
      expect(result).toBe('AI response');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer sk-test',
          }),
        })
      );
    });

    it('uses specified model', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      });

      await chatWithAI('Hello', [], { model: 'anthropic/claude-3.5-sonnet' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('anthropic/claude-3.5-sonnet');
    });

    it('uses lower max_tokens in fast mode', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      });

      await chatWithAI('Hello', [], { fast: true });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(1000);
    });

    it('includes image in request when provided', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'image response' } }] }),
      });

      await chatWithAI('Describe this', [], { image: { data: 'base64data', mimeType: 'image/png' } });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const lastMessage = body.messages[body.messages.length - 1];
      expect(Array.isArray(lastMessage.content)).toBe(true);
      expect(lastMessage.content[1].type).toBe('image_url');
    });

    it('includes history in messages', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      });

      await chatWithAI('Follow up', [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
      ]);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(3); // 2 history + 1 new
      expect(body.messages[0].role).toBe('user');
      expect(body.messages[1].role).toBe('assistant');
    });

    it('throws on API error response', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limited' } }),
      });

      await expect(chatWithAI('Hello', [])).rejects.toThrow('OpenRouter API error: Rate limited');
    });

    it('returns fallback when no content in response', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      });

      const result = await chatWithAI('Hello', []);
      expect(result).toBe('No response from AI');
    });

    it('throws on network failure', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      await expect(chatWithAI('Hello', [])).rejects.toThrow('OpenRouter API error: fetch failed');
    });
  });
});
