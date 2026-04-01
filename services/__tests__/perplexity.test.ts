import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock STORAGE_KEYS before importing the module
vi.mock('../../constants/storageKeys', () => ({
  STORAGE_KEYS: {
    PERPLEXITY_API_KEY: 'perplexity_api_key',
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

describe('perplexity', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws when no API key is configured', async () => {
    const { chatWithAI } = await import('../perplexity');
    await expect(chatWithAI('test prompt', [])).rejects.toThrow('Perplexity API key not configured');
  });

  it('calls the Perplexity API with correct endpoint and headers', async () => {
    vi.stubGlobal('localStorage', makeStorage({ perplexity_api_key: 'pplx-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        id: '1',
        model: 'sonar',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Test response' }, finish_reason: 'stop' }],
        citations: ['https://example.com/source1'],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    // Re-import to pick up new localStorage
    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { PERPLEXITY_API_KEY: 'perplexity_api_key' },
    }));
    const { chatWithAI } = await import('../perplexity');
    const result = await chatWithAI('What is Genesis?', []);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.perplexity.ai/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer pplx-test-key',
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result.text).toContain('Test response');
    expect(result.citations).toEqual(['https://example.com/source1']);
  });

  it('formats citations as markdown sources', async () => {
    vi.stubGlobal('localStorage', makeStorage({ perplexity_api_key: 'pplx-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        id: '1',
        model: 'sonar',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Answer text' }, finish_reason: 'stop' }],
        citations: ['https://www.example.com/article', 'https://scholar.google.com/paper'],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { PERPLEXITY_API_KEY: 'perplexity_api_key' },
    }));
    const { chatWithAI } = await import('../perplexity');
    const result = await chatWithAI('test', []);

    expect(result.text).toContain('Sources');
    expect(result.text).toContain('example.com');
    expect(result.text).toContain('scholar.google.com');
  });

  it('throws on API error', async () => {
    vi.stubGlobal('localStorage', makeStorage({ perplexity_api_key: 'pplx-test-key' }));

    const mockResponse = {
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { PERPLEXITY_API_KEY: 'perplexity_api_key' },
    }));
    const { chatWithAI } = await import('../perplexity');
    await expect(chatWithAI('test', [])).rejects.toThrow('Invalid API key');
  });

  it('uses sonar-pro model when thinking option is set', async () => {
    vi.stubGlobal('localStorage', makeStorage({ perplexity_api_key: 'pplx-test-key' }));

    const mockResponse = {
      ok: true,
      json: async () => ({
        id: '1',
        model: 'sonar-pro',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Deep answer' }, finish_reason: 'stop' }],
        citations: [],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: { PERPLEXITY_API_KEY: 'perplexity_api_key' },
    }));
    const { chatWithAI } = await import('../perplexity');
    await chatWithAI('test', [], { thinking: true });

    const callBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(callBody.model).toBe('sonar-pro');
  });
});
