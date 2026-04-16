import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FREE_MODELS, PREMIUM_MODELS, DEFAULT_FREE_MODEL,
  testApiKey, chatWithAI,
  fetchAvailableModels, clearModelCache,
  autoDetectBestFreeModel,
} from '../openrouter';
import { STORAGE_KEYS } from '../../constants/storageKeys';

// withRetry is a passthrough in these tests — retry behaviour is tested in retryUtils.test.ts
vi.mock('../../utils/retryUtils', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

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

    it('DEFAULT_FREE_MODEL is included in FREE_MODELS', () => {
      expect(FREE_MODELS.some(m => m.id === DEFAULT_FREE_MODEL)).toBe(true);
    });
  });

  describe('fetchAvailableModels', () => {
    beforeEach(() => {
      clearModelCache();
    });

    const mockModelsResponse = {
      data: [
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (free)', pricing: { prompt: '0', completion: '0' } },
        { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (free)', pricing: { prompt: '0', completion: '0' } },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', pricing: { prompt: '0.000003', completion: '0.000015' } },
        { id: 'openai/gpt-4o', name: 'GPT-4o', pricing: { prompt: '0.000005', completion: '0.000015' } },
      ],
    };

    it('fetches and parses models from OpenRouter API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockModelsResponse,
      });

      const models = await fetchAvailableModels();
      expect(models.length).toBe(4);
      expect(mockFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models');
    });

    it('marks :free suffix models as free', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });

      const models = await fetchAvailableModels();
      const llama = models.find(m => m.id === 'meta-llama/llama-3.3-70b-instruct:free');
      expect(llama?.isFree).toBe(true);
    });

    it('marks zero-pricing models as free', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });

      const models = await fetchAvailableModels();
      const gemma = models.find(m => m.id === 'google/gemma-3-27b-it:free');
      expect(gemma?.isFree).toBe(true);
    });

    it('marks paid models as not free', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });

      const models = await fetchAvailableModels();
      const claude = models.find(m => m.id === 'anthropic/claude-3.5-sonnet');
      expect(claude?.isFree).toBe(false);
    });

    it('sorts free models before premium models', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });

      const models = await fetchAvailableModels();
      const firstPaidIndex = models.findIndex(m => !m.isFree);
      const lastFreeIndex = models.reduce((acc, m, i) => m.isFree ? i : acc, -1);
      // All free models appear before all paid models
      expect(lastFreeIndex).toBeLessThan(firstPaidIndex);
    });

    it('returns cached results on second call without fetching again', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockModelsResponse });

      await fetchAvailableModels();
      await fetchAvailableModels();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('re-fetches after clearModelCache()', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => mockModelsResponse });

      await fetchAvailableModels();
      clearModelCache();
      await fetchAvailableModels();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Service Unavailable' });

      await expect(fetchAvailableModels()).rejects.toThrow('Failed to fetch OpenRouter models');
    });

    it('extracts provider from model ID', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });

      const models = await fetchAvailableModels();
      const llama = models.find(m => m.id === 'meta-llama/llama-3.3-70b-instruct:free');
      expect(llama?.provider).toBe('meta-llama');
    });
  });

  describe('testApiKey with model param', () => {
    it('uses specified model when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: 'google/gemma-3-27b-it:free', choices: [{ message: { content: 'ok' } }] }),
      });

      const result = await testApiKey('sk-test', 'google/gemma-3-27b-it:free');
      expect(result.success).toBe(true);
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('google/gemma-3-27b-it:free');
    });

    it('uses DEFAULT_FREE_MODEL when no model specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ model: DEFAULT_FREE_MODEL, choices: [] }),
      });

      await testApiKey('sk-test');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe(DEFAULT_FREE_MODEL);
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
      expect(result).toEqual({ text: 'AI response', model: 'free' });
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
      expect(body.messages).toHaveLength(4); // 1 system + 2 history + 1 new
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[2].role).toBe('assistant');
      expect(body.messages[3].role).toBe('user');
    });

    it('includes bilingual system prompt enforcing [SPLIT] separator', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'response' } }] }),
      });

      await chatWithAI('Hello', []);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[0].content).toContain('[SPLIT]');
      expect(body.messages[0].content).toContain('BILINGUAL KEYWORDS');
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
      expect(result).toEqual({ text: 'No response from AI', model: 'free' });
    });

    it('throws on network failure', async () => {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-test');

      mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

      await expect(chatWithAI('Hello', [])).rejects.toThrow('OpenRouter API error: fetch failed');
    });
  });

  describe('autoDetectBestFreeModel', () => {
    beforeEach(() => {
      clearModelCache();
    });

    const mockModelsResponse = {
      data: [
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', pricing: { prompt: '0', completion: '0' } },
        { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1', pricing: { prompt: '0', completion: '0' } },
        { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', pricing: { prompt: '0', completion: '0' } },
      ],
    };

    function makeTestResponse(success: boolean) {
      if (success) {
        return { ok: true, json: async () => ({ model: 'test', choices: [{ message: { content: 'ok' } }] }) };
      }
      return { ok: false, status: 503, statusText: 'Service Unavailable', json: async () => ({ error: { message: 'unavailable' } }) };
    }

    it('returns best and working list when first model succeeds', async () => {
      // fetchAvailableModels call
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });
      // google model is tested first (highest provider priority)
      mockFetch.mockResolvedValueOnce(makeTestResponse(true));

      const result = await autoDetectBestFreeModel('sk-test');
      expect(result.best?.modelId).toBe('google/gemma-3-27b-it:free');
      expect(result.working.length).toBeGreaterThan(0);
    });

    it('skips failed models and returns next working one', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });
      // google fails, meta-llama succeeds
      mockFetch.mockResolvedValueOnce(makeTestResponse(false));
      mockFetch.mockResolvedValueOnce(makeTestResponse(true));

      const result = await autoDetectBestFreeModel('sk-test');
      expect(result.best?.modelId).toBe('meta-llama/llama-3.3-70b-instruct:free');
      expect(result.working.some(m => m.modelId === 'google/gemma-3-27b-it:free')).toBe(false);
    });

    it('returns { working: [], best: null } when all models fail', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });
      // all fail
      mockFetch.mockResolvedValue(makeTestResponse(false));

      const result = await autoDetectBestFreeModel('sk-test');
      expect(result.best).toBeNull();
      expect(result.working).toHaveLength(0);
    });

    it('collects all working models in working array', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });
      // all three succeed
      mockFetch.mockResolvedValue(makeTestResponse(true));

      const result = await autoDetectBestFreeModel('sk-test');
      expect(result.working.length).toBe(3);
    });

    it('calls onProgress with testing then success for working model', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });
      mockFetch.mockResolvedValueOnce(makeTestResponse(true));
      mockFetch.mockResolvedValue(makeTestResponse(false));

      const progress: import('../openrouter').AutoDetectProgress[] = [];
      await autoDetectBestFreeModel('sk-test', p => progress.push({ ...p }));

      // google/gemma tested first due to provider priority
      const googleEvents = progress.filter(p => p.modelId === 'google/gemma-3-27b-it:free');
      expect(googleEvents[0]?.status).toBe('testing');
      expect(googleEvents[1]?.status).toBe('success');
    });

    it('calls onProgress with testing then failed for unavailable model', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockModelsResponse });
      mockFetch.mockResolvedValue(makeTestResponse(false));

      const progress: import('../openrouter').AutoDetectProgress[] = [];
      await autoDetectBestFreeModel('sk-test', p => progress.push({ ...p }));

      const googleEvents = progress.filter(p => p.modelId === 'google/gemma-3-27b-it:free');
      expect(googleEvents[0]?.status).toBe('testing');
      expect(googleEvents[1]?.status).toBe('failed');
    });

    it('falls back to FREE_MODELS when fetchAvailableModels throws', async () => {
      // fetchAvailableModels fails
      mockFetch.mockRejectedValueOnce(new Error('network error'));
      // testApiKey calls for FREE_MODELS fallback models
      mockFetch.mockResolvedValue(makeTestResponse(true));

      const result = await autoDetectBestFreeModel('sk-test');
      // Should still work using FREE_MODELS as fallback
      expect(result.working.length).toBeGreaterThan(0);
    });

    it('respects provider priority — google before meta-llama before unknown providers', async () => {
      const responseWithExtra = {
        data: [
          { id: 'some/other-free-model:free', name: 'Other Free', pricing: { prompt: '0', completion: '0' } },
          { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', pricing: { prompt: '0', completion: '0' } },
          { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', pricing: { prompt: '0', completion: '0' } },
        ],
      };
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => responseWithExtra });
      mockFetch.mockResolvedValue(makeTestResponse(true));

      const result = await autoDetectBestFreeModel('sk-test');
      const googleIdx = result.working.findIndex(m => m.modelId === 'google/gemma-3-27b-it:free');
      const metaIdx = result.working.findIndex(m => m.modelId === 'meta-llama/llama-3.3-70b-instruct:free');
      const otherIdx = result.working.findIndex(m => m.modelId === 'some/other-free-model:free');
      expect(googleIdx).toBeLessThan(metaIdx);
      expect(metaIdx).toBeLessThan(otherIdx);
    });
  });
});
