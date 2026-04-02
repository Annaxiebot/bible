import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../constants/storageKeys', () => ({
  STORAGE_KEYS: {
    EXA_API_KEY: 'exa_api_key',
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

describe('exa', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws when no API key is configured', async () => {
    const { searchWithExa } = await import('../exa');
    await expect(searchWithExa('test query')).rejects.toThrow('Exa API key not configured');
  });

  it('calls the Exa API with correct endpoint and headers', async () => {
    vi.stubGlobal('localStorage', makeStorage({ exa_api_key: 'exa-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        results: [
          { url: 'https://example.com/1', title: 'Result 1', text: 'Text content 1', author: 'Author 1' },
          { url: 'https://example.com/2', title: 'Result 2', text: 'Text content 2', author: '' },
        ],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { EXA_API_KEY: 'exa_api_key' },
    }));
    const { searchWithExa } = await import('../exa');
    const result = await searchWithExa('What is Genesis?');

    expect(fetch).toHaveBeenCalledWith(
      'https://api.exa.ai/search',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'exa-test-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    const callBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(callBody.query).toBe('What is Genesis?');
    expect(callBody.type).toBe('auto');
    expect(callBody.numResults).toBe(5);
    expect(callBody.contents.text.maxCharacters).toBe(1000);

    expect(result.text).toContain('Result 1');
    expect(result.text).toContain('Author 1');
    expect(result.citations).toEqual(['https://example.com/1', 'https://example.com/2']);
  });

  it('throws on API error', async () => {
    vi.stubGlobal('localStorage', makeStorage({ exa_api_key: 'exa-test-key' }));

    const mockResponse = {
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { EXA_API_KEY: 'exa_api_key' },
    }));
    const { searchWithExa } = await import('../exa');
    await expect(searchWithExa('test')).rejects.toThrow('Unauthorized');
  });
});
