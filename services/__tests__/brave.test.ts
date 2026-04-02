import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../constants/storageKeys', () => ({
  STORAGE_KEYS: {
    BRAVE_API_KEY: 'brave_api_key',
  },
}));

function makeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
}

describe('brave', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws when no API key is configured', async () => {
    const { searchWithBrave } = await import('../brave');
    await expect(searchWithBrave('test query')).rejects.toThrow('Brave Search API key not configured');
  });

  it('calls the Brave API with correct endpoint and headers', async () => {
    vi.stubGlobal('localStorage', makeStorage({ brave_api_key: 'brave-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'Result 1', url: 'https://example.com/1', description: 'Description 1' },
            { title: 'Result 2', url: 'https://example.com/2', description: 'Description 2' },
          ],
        },
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { BRAVE_API_KEY: 'brave_api_key' },
    }));
    const { searchWithBrave } = await import('../brave');
    const result = await searchWithBrave('What is Genesis?');

    const callUrl = (fetch as any).mock.calls[0][0];
    expect(callUrl).toContain('https://api.search.brave.com/res/v1/web/search');
    expect(callUrl).toContain('q=What+is+Genesis');
    expect(callUrl).toContain('count=5');

    const callHeaders = (fetch as any).mock.calls[0][1].headers;
    expect(callHeaders['X-Subscription-Token']).toBe('brave-test-key');
    expect(callHeaders['Accept']).toBe('application/json');

    expect(result.text).toContain('Result 1');
    expect(result.text).toContain('Description 1');
    expect(result.citations).toEqual(['https://example.com/1', 'https://example.com/2']);
  });

  it('uses GET method', async () => {
    vi.stubGlobal('localStorage', makeStorage({ brave_api_key: 'brave-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({ web: { results: [] } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { BRAVE_API_KEY: 'brave_api_key' },
    }));
    const { searchWithBrave } = await import('../brave');
    await searchWithBrave('test');

    expect((fetch as any).mock.calls[0][1].method).toBe('GET');
  });

  it('throws on API error', async () => {
    vi.stubGlobal('localStorage', makeStorage({ brave_api_key: 'brave-test-key' }));

    const mockResponse = {
      ok: false,
      status: 429,
      json: async () => ({ message: 'Rate limit exceeded' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { BRAVE_API_KEY: 'brave_api_key' },
    }));
    const { searchWithBrave } = await import('../brave');
    await expect(searchWithBrave('test')).rejects.toThrow('Rate limit exceeded');
  });
});
