import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FREE_ROUTER_MODEL, getApiKey, testApiKey } from '../openrouter';
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

  it('FREE_ROUTER_MODEL is the id OpenRouter lists for its free router', () => {
    expect(FREE_ROUTER_MODEL).toBe('openrouter/free');
  });

  describe('getApiKey', () => {
    it('returns the stored own key', () => {
      vi.stubGlobal('localStorage', makeStorage({ [STORAGE_KEYS.OPENROUTER_API_KEY]: 'sk-own' }));
      expect(getApiKey()).toBe('sk-own');
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

    it('uses a free model when no model specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [] }),
      });

      const result = await testApiKey('sk-test');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toMatch(/:free$/);
      expect(result.model).toBe(body.model);
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
      expect(result.status).toBe(401); // typed outcome for the setup dialog
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await testApiKey('sk-test-key');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(result.status).toBeUndefined(); // no HTTP reply at all
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

});
