import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../constants/storageKeys', () => ({
  STORAGE_KEYS: {
    TAVILY_API_KEY: 'tavily_api_key',
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

describe('tavily', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws when no API key is configured', async () => {
    const { searchWithTavily } = await import('../tavily');
    await expect(searchWithTavily('test query')).rejects.toThrow('Tavily API key not configured');
  });

  it('calls the Tavily API with correct endpoint and body', async () => {
    vi.stubGlobal('localStorage', makeStorage({ tavily_api_key: 'tvly-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        answer: 'Test answer from Tavily',
        results: [
          { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1' },
          { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2' },
        ],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { TAVILY_API_KEY: 'tavily_api_key' },
    }));
    const { searchWithTavily } = await import('../tavily');
    const result = await searchWithTavily('What is Genesis?');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
      })
    );

    const callBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(callBody.api_key).toBe('tvly-test-key');
    expect(callBody.query).toBe('What is Genesis?');
    expect(callBody.search_depth).toBe('advanced');
    expect(callBody.include_answer).toBe(true);
    expect(callBody.max_results).toBe(5);

    expect(result.text).toContain('Test answer from Tavily');
    expect(result.citations).toEqual(['https://example.com/1', 'https://example.com/2']);
  });

  it('formats citations as markdown sources', async () => {
    vi.stubGlobal('localStorage', makeStorage({ tavily_api_key: 'tvly-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        answer: 'Answer text',
        results: [
          { title: 'R1', url: 'https://www.example.com/article', content: 'C1' },
        ],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { TAVILY_API_KEY: 'tavily_api_key' },
    }));
    const { searchWithTavily } = await import('../tavily');
    const result = await searchWithTavily('test');

    expect(result.text).toContain('Sources');
    expect(result.text).toContain('example.com');
  });

  it('throws on API error', async () => {
    vi.stubGlobal('localStorage', makeStorage({ tavily_api_key: 'tvly-test-key' }));

    const mockResponse = {
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid API key' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { TAVILY_API_KEY: 'tavily_api_key' },
    }));
    const { searchWithTavily } = await import('../tavily');
    await expect(searchWithTavily('test')).rejects.toThrow('Invalid API key');
  });
});
