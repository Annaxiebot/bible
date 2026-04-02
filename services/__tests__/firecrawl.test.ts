import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../constants/storageKeys', () => ({
  STORAGE_KEYS: {
    FIRECRAWL_API_KEY: 'firecrawl_api_key',
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

describe('firecrawl', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws when no API key is configured', async () => {
    const { searchWithFirecrawl } = await import('../firecrawl');
    await expect(searchWithFirecrawl('test query')).rejects.toThrow('Firecrawl API key not configured');
  });

  it('calls the Firecrawl API with correct endpoint and headers', async () => {
    vi.stubGlobal('localStorage', makeStorage({ firecrawl_api_key: 'fc-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        data: [
          { url: 'https://example.com/1', title: 'Result 1', description: 'Desc 1', markdown: '# Content 1' },
          { url: 'https://example.com/2', title: 'Result 2', description: 'Desc 2', markdown: '# Content 2' },
        ],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { FIRECRAWL_API_KEY: 'firecrawl_api_key' },
    }));
    const { searchWithFirecrawl } = await import('../firecrawl');
    const result = await searchWithFirecrawl('What is Genesis?');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.firecrawl.dev/v1/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer fc-test-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    const callBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(callBody.query).toBe('What is Genesis?');
    expect(callBody.limit).toBe(5);

    expect(result.text).toContain('Result 1');
    expect(result.citations).toEqual(['https://example.com/1', 'https://example.com/2']);
  });

  it('throws on API error', async () => {
    vi.stubGlobal('localStorage', makeStorage({ firecrawl_api_key: 'fc-test-key' }));

    const mockResponse = {
      ok: false,
      status: 403,
      json: async () => ({ error: 'Forbidden' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { FIRECRAWL_API_KEY: 'firecrawl_api_key' },
    }));
    const { searchWithFirecrawl } = await import('../firecrawl');
    await expect(searchWithFirecrawl('test')).rejects.toThrow('Forbidden');
  });
});
