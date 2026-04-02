import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
vi.mock('../../constants/storageKeys', () => ({
  STORAGE_KEYS: {
    PERPLEXITY_API_KEY: 'perplexity_api_key',
    TAVILY_API_KEY: 'tavily_api_key',
    FIRECRAWL_API_KEY: 'firecrawl_api_key',
    EXA_API_KEY: 'exa_api_key',
    BRAVE_API_KEY: 'brave_api_key',
    OPENROUTER_API_KEY: 'openrouter_api_key',
    GEMINI_API_KEY: 'gemini_api_key',
    CLAUDE_API_KEY: 'claude_api_key',
    OPENAI_API_KEY: 'openai_api_key',
    KIMI_API_KEY: 'kimi_api_key',
    NVIDIA_API_KEY: 'nvidia_api_key',
    DEEPSEEK_API_KEY: 'deepseek_api_key',
    GROQ_API_KEY: 'groq_api_key',
    DASHSCOPE_API_KEY: 'dashscope_api_key',
    MINIMAX_API_KEY: 'minimax_api_key',
    ZHIPU_API_KEY: 'zhipu_api_key',
    ZAI_API_KEY: 'zai_api_key',
    R9S_API_KEY: 'r9s_api_key',
    MOONSHOT_API_KEY: 'moonshot_api_key',
    AI_PROVIDER: 'ai_provider',
    AI_MODEL: 'ai_model',
  },
}));

vi.mock('../perplexity', () => ({
  chatWithAI: vi.fn().mockResolvedValue({ text: 'Perplexity answer', citations: ['https://perp.com'] }),
}));

vi.mock('../tavily', () => ({
  searchWithTavily: vi.fn().mockResolvedValue({ text: 'Tavily answer', citations: ['https://tavily.com'] }),
  getRawResults: vi.fn().mockResolvedValue({
    results: [{ title: 'T1', content: 'C1', url: 'https://tavily.com' }],
    answer: 'Tavily direct answer',
  }),
}));

vi.mock('../firecrawl', () => ({
  searchWithFirecrawl: vi.fn().mockResolvedValue({ text: 'Firecrawl answer', citations: ['https://firecrawl.com'] }),
  getRawResults: vi.fn().mockResolvedValue({
    results: [{ title: 'F1', content: 'FC1', url: 'https://firecrawl.com' }],
  }),
}));

vi.mock('../exa', () => ({
  searchWithExa: vi.fn().mockResolvedValue({ text: 'Exa answer', citations: ['https://exa.com'] }),
  getRawResults: vi.fn().mockResolvedValue({
    results: [{ title: 'E1', content: 'EC1', url: 'https://exa.com' }],
  }),
}));

vi.mock('../brave', () => ({
  searchWithBrave: vi.fn().mockResolvedValue({ text: 'Brave answer', citations: ['https://brave.com'] }),
  getRawResults: vi.fn().mockResolvedValue({
    results: [{ title: 'B1', content: 'BC1', url: 'https://brave.com' }],
  }),
}));

// Mock the other AI providers to prevent import errors
vi.mock('../gemini', () => ({
  chatWithAI: vi.fn(),
  generateImage: vi.fn(),
  editImage: vi.fn(),
  generateVideo: vi.fn(),
  speak: vi.fn(),
  stopSpeech: vi.fn(),
  analyzeMedia: vi.fn(),
}));
vi.mock('../claude', () => ({ chatWithAI: vi.fn() }));
vi.mock('../kimi', () => ({ chatWithAI: vi.fn() }));
vi.mock('../openai', () => ({ chatWithAI: vi.fn() }));
vi.mock('../openrouter', () => ({
  chatWithAI: vi.fn(),
  testApiKey: vi.fn(),
  FREE_MODELS: [],
  PREMIUM_MODELS: [],
}));
vi.mock('../supabase', () => ({
  supabase: null,
  authManager: { subscribe: vi.fn(), getState: () => ({ isAuthenticated: false }), getUserId: () => null },
  isSupabaseConfigured: () => false,
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

describe('webSearch router', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage({
      perplexity_api_key: 'pplx-key',
      tavily_api_key: 'tvly-key',
      firecrawl_api_key: 'fc-key',
      exa_api_key: 'exa-key',
      brave_api_key: 'brave-key',
    }));
  });

  it('routes to perplexity', async () => {
    const { webSearch } = await import('../aiProvider');
    const result = await webSearch('test', 'perplexity');
    expect(result.provider).toBe('Perplexity');
    expect(result.text).toContain('Perplexity answer');
  });

  it('routes to tavily and uses direct answer when available', async () => {
    const { webSearch } = await import('../aiProvider');
    const result = await webSearch('test', 'tavily');
    expect(result.provider).toBe('Tavily');
    expect(result.text).toContain('Tavily direct answer');
  });

  it('getConfiguredWebSearchProviders returns only configured providers', async () => {
    vi.stubGlobal('localStorage', makeStorage({
      perplexity_api_key: 'pplx-key',
      brave_api_key: 'brave-key',
    }));

    vi.resetModules();
    // Re-mock everything after resetModules
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: {
        PERPLEXITY_API_KEY: 'perplexity_api_key',
        TAVILY_API_KEY: 'tavily_api_key',
        FIRECRAWL_API_KEY: 'firecrawl_api_key',
        EXA_API_KEY: 'exa_api_key',
        BRAVE_API_KEY: 'brave_api_key',
        OPENROUTER_API_KEY: 'openrouter_api_key',
        GEMINI_API_KEY: 'gemini_api_key',
        CLAUDE_API_KEY: 'claude_api_key',
        OPENAI_API_KEY: 'openai_api_key',
        KIMI_API_KEY: 'kimi_api_key',
        NVIDIA_API_KEY: 'nvidia_api_key',
        DEEPSEEK_API_KEY: 'deepseek_api_key',
        GROQ_API_KEY: 'groq_api_key',
        DASHSCOPE_API_KEY: 'dashscope_api_key',
        MINIMAX_API_KEY: 'minimax_api_key',
        ZHIPU_API_KEY: 'zhipu_api_key',
        ZAI_API_KEY: 'zai_api_key',
        R9S_API_KEY: 'r9s_api_key',
        MOONSHOT_API_KEY: 'moonshot_api_key',
        AI_PROVIDER: 'ai_provider',
        AI_MODEL: 'ai_model',
      },
    }));

    const { getConfiguredWebSearchProviders } = await import('../aiProvider');
    const providers = getConfiguredWebSearchProviders();
    expect(providers).toContain('perplexity');
    expect(providers).toContain('brave');
    expect(providers).not.toContain('tavily');
    expect(providers).not.toContain('firecrawl');
    expect(providers).not.toContain('exa');
  });

  it('isWebSearchProviderConfigured returns correct values', async () => {
    vi.stubGlobal('localStorage', makeStorage({
      tavily_api_key: 'tvly-key',
    }));

    vi.resetModules();
    vi.mock('../../constants/storageKeys', () => ({
      STORAGE_KEYS: {
        PERPLEXITY_API_KEY: 'perplexity_api_key',
        TAVILY_API_KEY: 'tavily_api_key',
        FIRECRAWL_API_KEY: 'firecrawl_api_key',
        EXA_API_KEY: 'exa_api_key',
        BRAVE_API_KEY: 'brave_api_key',
        OPENROUTER_API_KEY: 'openrouter_api_key',
        GEMINI_API_KEY: 'gemini_api_key',
        CLAUDE_API_KEY: 'claude_api_key',
        OPENAI_API_KEY: 'openai_api_key',
        KIMI_API_KEY: 'kimi_api_key',
        NVIDIA_API_KEY: 'nvidia_api_key',
        DEEPSEEK_API_KEY: 'deepseek_api_key',
        GROQ_API_KEY: 'groq_api_key',
        DASHSCOPE_API_KEY: 'dashscope_api_key',
        MINIMAX_API_KEY: 'minimax_api_key',
        ZHIPU_API_KEY: 'zhipu_api_key',
        ZAI_API_KEY: 'zai_api_key',
        R9S_API_KEY: 'r9s_api_key',
        MOONSHOT_API_KEY: 'moonshot_api_key',
        AI_PROVIDER: 'ai_provider',
        AI_MODEL: 'ai_model',
      },
    }));

    const { isWebSearchProviderConfigured } = await import('../aiProvider');
    expect(isWebSearchProviderConfigured('tavily')).toBe(true);
    expect(isWebSearchProviderConfigured('perplexity')).toBe(false);
  });
});
