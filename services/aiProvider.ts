/**
 * AI Provider Abstraction Layer
 * 
 * This module provides a unified interface for AI research providers (Gemini, Claude, and Kimi).
 * It routes requests to the appropriate provider based on user settings.
 */

import * as gemini from './gemini';
import * as claude from './claude';
import * as kimi from './kimi';
import * as openai from './openai';
import * as openrouter from './openrouter';
import * as perplexity from './perplexity';
import * as tavily from './tavily';
import * as firecrawl from './firecrawl';
import * as exa from './exa';
import * as brave from './brave';
import { STORAGE_KEYS } from '../constants/storageKeys';

export type AIProvider = 'openrouter' | 'gemini' | 'claude' | 'openai' | 'kimi' | 'nvidia' | 'deepseek' | 'groq' | 'dashscope' | 'minimax' | 'zhipu' | 'zai' | 'r9s' | 'moonshot' | 'perplexity';
export type AIModel = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-flash-lite-latest' | 'moonshot-v1-128k' | 'gpt-4o' | 'gpt-4o-mini' | string;

// Storage keys
const PROVIDER_KEY = STORAGE_KEYS.AI_PROVIDER;
const MODEL_KEY = STORAGE_KEYS.AI_MODEL;

/**
 * Get the current AI provider from settings
 */
const ALL_PROVIDERS: AIProvider[] = ['openrouter', 'gemini', 'claude', 'openai', 'kimi', 'nvidia', 'deepseek', 'groq', 'dashscope', 'minimax', 'zhipu', 'zai', 'r9s', 'moonshot', 'perplexity'];

export const getCurrentProvider = (): AIProvider => {
  const stored = localStorage.getItem(PROVIDER_KEY);
  return ALL_PROVIDERS.includes(stored as AIProvider) ? (stored as AIProvider) : 'gemini';
};

/**
 * Set the AI provider
 */
export const setProvider = (provider: AIProvider): void => {
  localStorage.setItem(PROVIDER_KEY, provider);
};

/**
 * Get the current model
 */
const VALID_MODELS: readonly string[] = [
  'claude-haiku-4-5', 'claude-sonnet-4-5', 'claude-opus-4-5',
  'gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-flash-lite-latest',
  'moonshot-v1-128k',
  'gpt-4o', 'gpt-4o-mini',
];

export const getCurrentModel = (): AIModel | null => {
  const stored = localStorage.getItem(MODEL_KEY);
  if (!stored) return null;
  // Accept known direct-provider models OR OpenRouter-format IDs (contain '/')
  return (VALID_MODELS.includes(stored) || stored.includes('/')) ? (stored as AIModel) : null;
};

/**
 * Set the AI model
 */
export const setModel = (model: AIModel): void => {
  localStorage.setItem(MODEL_KEY, model);
};

/**
 * Call AI via Supabase Edge Function (server-side proxy).
 * Used when user is logged in — avoids CORS issues and keeps API keys server-side.
 */
const callViaEdgeFunction = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string }; model?: string }
): Promise<{ text: string; model?: string; provider: string }> => {
  const { supabase } = await import('./supabase');
  if (!supabase) throw new Error('Supabase not configured');

  // Refresh session to ensure token is valid
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated — try signing out and back in');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      prompt,
      history,
      options: {
        ...options,
        useFreeRouter: localStorage.getItem('useFreeRouter') !== 'false',
        autoRace: localStorage.getItem('autoRaceAI') === 'true',
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Edge function error: ${response.status}`);
  }

  return { text: data.text, model: data.model, provider: data.provider, ...(data.racePool ? { racePool: data.racePool } : {}) };
};

/**
 * Stream AI response via Edge Function (SSE).
 * Yields text chunks as they arrive — user sees tokens immediately.
 */
export const streamViaEdgeFunction = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; model?: string },
  onChunk: (text: string) => void,
  onDone: (model?: string, provider?: string, racePool?: any[]) => void,
  onError: (error: Error) => void,
): Promise<void> => {
  const { supabase } = await import('./supabase');
  if (!supabase) { onError(new Error('Supabase not configured')); return; }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) { onError(new Error('Not authenticated')); return; }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const isRacing = localStorage.getItem('autoRaceAI') === 'true';

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': supabaseKey,
    },
    body: JSON.stringify({
      prompt,
      history,
      options: {
        ...options,
        useFreeRouter: localStorage.getItem('useFreeRouter') !== 'false',
        autoRace: isRacing,
        stream: true, // Stream in both single and race mode (race streams first-token-wins)
      },
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    onError(new Error(data.error || `Edge function error: ${response.status}`));
    return;
  }

  const contentType = response.headers.get('Content-Type') || '';

  // If server returned JSON (race mode or non-streaming fallback), handle as before
  if (contentType.includes('application/json')) {
    const data = await response.json();
    onChunk(data.text || '');
    onDone(data.model, data.provider, data.racePool);
    return;
  }

  // SSE streaming
  let model: string | undefined;
  let provider: string | undefined;
  let racePool: any[] | undefined;
  const reader = response.body?.getReader();
  if (!reader) { onError(new Error('No response body')); return; }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        // Metadata event (first event from edge function)
        if (parsed.meta) {
          model = parsed.model;
          provider = parsed.provider;
          if (parsed.racePool) racePool = parsed.racePool;
          continue;
        }
        // Gemini SSE format
        if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
          onChunk(parsed.candidates[0].content.parts[0].text);
        }
        // OpenAI-compatible SSE format
        else if (parsed.choices?.[0]?.delta?.content) {
          onChunk(parsed.choices[0].delta.content);
        }
        // Anthropic SSE format
        else if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onChunk(parsed.delta.text);
        }
      } catch {
        // Skip unparseable lines
      }
    }
  }

  onDone(model, provider, racePool);
};

/**
 * Check if we should use the Edge Function (user is logged in with synced settings)
 */
// Cache auth state to avoid async import in sync function
let _isEdgeFunctionEnabled = false;

// Listen for auth changes to update edge function routing
import('./supabase').then(({ authManager, isSupabaseConfigured }) => {
  if (!isSupabaseConfigured()) return;
  authManager.subscribe((state) => {
    _isEdgeFunctionEnabled = state.isAuthenticated;
  });
}).catch(() => {});

const shouldUseEdgeFunction = (): boolean => {
  if (!_isEdgeFunctionEnabled) return false;
  return localStorage.getItem('useServerAI') !== 'false';
};

/**
 * Call a single provider and normalize the result.
 * Routes through Edge Function when logged in, otherwise calls directly.
 */
const callProvider = async (
  provider: AIProvider,
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string }; model?: string }
): Promise<{ text: string; model?: string; provider: string }> => {
  // When logged in, route through Edge Function (server-side proxy)
  if (shouldUseEdgeFunction()) {
    return callViaEdgeFunction(prompt, history, options);
  }

  // Otherwise, call providers directly (local API keys)
  const providerNames: Record<string, string> = {
    openrouter: 'OpenRouter', gemini: 'Gemini', claude: 'Claude',
    openai: 'OpenAI', kimi: 'Kimi', nvidia: 'NVIDIA',
    deepseek: 'DeepSeek', groq: 'Groq', dashscope: 'DashScope/Qwen',
    minimax: 'MiniMax', zhipu: 'Zhipu/GLM', zai: 'Z.AI',
    r9s: 'R9S.AI', moonshot: 'Moonshot/Kimi', perplexity: 'Perplexity',
  };

  if (provider === 'openrouter') {
    const selectedModel = options.model || '';
    const useFreeRouter = selectedModel === 'openrouter/auto:free' || (!selectedModel);
    const model = selectedModel.replace(':free', '') || undefined;
    const result = await openrouter.chatWithAI(prompt, history, { ...options, model, useFreeRouter });
    return { text: result.text, model: result.model, provider: providerNames.openrouter };
  } else if (provider === 'claude') {
    const result = await claude.chatWithAI(prompt, history, options);
    const text = typeof result === 'string' ? result : (result as any).text || result;
    return { text: String(text), model: options.model || 'claude', provider: providerNames.claude };
  } else if (provider === 'kimi') {
    const result = await kimi.chatWithAI(prompt, history, options);
    const text = typeof result === 'string' ? result : (result as any).text || result;
    return { text: String(text), model: options.model || 'kimi', provider: providerNames.kimi };
  } else if (provider === 'openai') {
    const result = await openai.chatWithAI(prompt, history, options);
    const text = typeof result === 'string' ? result : (result as any).text || result;
    return { text: String(text), model: options.model || 'openai', provider: providerNames.openai };
  } else if (provider === 'gemini') {
    const result = await gemini.chatWithAI(prompt, history, options);
    if (typeof result === 'object' && result !== null && 'candidates' in result) {
      return { text: (result as any).text || String(result), model: options.model || 'gemini', provider: providerNames.gemini, ...(result as any) };
    }
    const text = typeof result === 'string' ? result : (result as any).text || result;
    return { text: String(text), model: options.model || 'gemini', provider: providerNames.gemini };
  } else if (provider === 'perplexity') {
    const result = await perplexity.chatWithAI(prompt, history, options);
    return { text: result.text, model: options.model || 'sonar', provider: providerNames.perplexity };
  } else {
    // Generic OpenAI-compatible handler for: nvidia, deepseek, groq, dashscope, minimax, zhipu, r9s, moonshot
    const OPENAI_COMPATIBLE_ENDPOINTS: Record<string, string> = {
      nvidia: 'https://integrate.api.nvidia.com/v1/chat/completions',
      deepseek: 'https://api.deepseek.com/v1/chat/completions',
      groq: 'https://api.groq.com/openai/v1/chat/completions',
      dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      minimax: 'https://api.minimax.io/v1/chat/completions',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      r9s: 'https://api.r9s.ai/v1/chat/completions',
      moonshot: 'https://api.moonshot.ai/v1/chat/completions',
      zai: 'https://api.z.ai/api/anthropic/v1/messages',
    };
    const endpoint = OPENAI_COMPATIBLE_ENDPOINTS[provider];
    if (!endpoint) throw new Error(`Unknown provider: ${provider}`);

    const apiKeyStorageKey = PROVIDER_KEY_MAP[provider];
    const apiKey = apiKeyStorageKey ? localStorage.getItem(apiKeyStorageKey) : null;
    if (!apiKey) throw new Error(`No API key configured for ${providerNames[provider] || provider}. Add it in Settings.`);

    const model = options.model || '';
    const messages = [
      ...history.map(h => ({ role: h.role, content: h.content })),
      { role: 'user', content: prompt },
    ];

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: 4096, temperature: 0.7 }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `${providerNames[provider] || provider} API error: ${response.status}`);
    }

    const text = data.choices?.[0]?.message?.content || '';
    const usedModel = data.model || model;
    return { text, model: usedModel, provider: providerNames[provider] || provider };
  }
};

/**
 * Get fallback providers (configured providers other than the primary)
 */
const getFallbackProviders = (primary: AIProvider): AIProvider[] => {
  return ALL_PROVIDERS.filter(p => p !== primary && isProviderConfigured(p));
};

/**
 * Text Chat with AI - Routes to appropriate provider with automatic fallback
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string } } = {}
): Promise<string | { text: string; model?: string; provider?: string }> => {
  const provider = getCurrentProvider();
  const model = getCurrentModel();

  try {
    return await callProvider(provider, prompt, history, { ...options, model: model || undefined });
  } catch (primaryError: any) {
    // Don't fallback on abort
    if (primaryError?.name === 'AbortError') throw primaryError;

    // Try fallback providers
    const fallbacks = getFallbackProviders(provider);
    for (const fallback of fallbacks) {
      try {
        console.warn(`[AI] Primary provider ${provider} failed, trying fallback: ${fallback}`);
        const result = await callProvider(fallback, prompt, history, options);
        return { ...result, model: `${result.model} (fallback)` };
      } catch {
        continue;
      }
    }

    // All providers failed - throw original error
    throw primaryError;
  }
};

/**
 * Get available providers
 */
export const getAvailableProviders = (): { id: AIProvider; name: string; models: string[] }[] => {
  // Get OpenRouter models
  const openrouterModels = [
    ...openrouter.FREE_MODELS.map(m => `${m.id} (${m.provider} - Free)`),
    ...openrouter.PREMIUM_MODELS.map(m => `${m.id} (${m.provider})`),
  ];

  return [
    {
      id: 'openrouter',
      name: 'OpenRouter (Multi-Model Gateway)',
      models: openrouterModels
    },
    {
      id: 'gemini',
      name: 'Google Gemini (Direct)',
      models: [
        'gemini-3-flash-preview',
        'gemini-3-pro-preview',
        'gemini-flash-lite-latest'
      ]
    },
    {
      id: 'claude',
      name: 'Anthropic Claude (Direct)',
      models: [
        'claude-haiku-4-5',
        'claude-sonnet-4-5',
        'claude-opus-4-5'
      ]
    },
    {
      id: 'openai',
      name: 'OpenAI ChatGPT (Direct)',
      models: [
        'gpt-4o',
        'gpt-4o-mini'
      ]
    },
    {
      id: 'kimi',
      name: 'Kimi Moonshot (月之暗面)',
      models: [
        'moonshot-v1-128k'
      ]
    },
    {
      id: 'nvidia',
      name: 'NVIDIA NIM',
      models: [
        'nvidia/llama-3.1-nemotron-ultra-253b-v1',
        'nvidia/llama-3.3-nemotron-super-49b-v1',
        'meta/llama-3.1-8b-instruct'
      ]
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      models: [
        'deepseek-chat',
        'deepseek-reasoner'
      ]
    },
    {
      id: 'groq',
      name: 'Groq (Fast Inference)',
      models: [
        'llama-3.3-70b-versatile',
        'llama-3.1-8b-instant',
        'meta-llama/llama-4-scout-17b-16e-instruct'
      ]
    },
    {
      id: 'dashscope',
      name: 'DashScope / Qwen (阿里通义)',
      models: [
        'qwen3.5-max',
        'qwen3.5-plus',
        'qwen3.5-flash'
      ]
    },
    {
      id: 'minimax',
      name: 'MiniMax',
      models: [
        'MiniMax-M2.5',
        'MiniMax-M2.5-highspeed',
        'MiniMax-M2.1'
      ]
    },
    {
      id: 'zhipu',
      name: 'Zhipu GLM (智谱清言)',
      models: [
        'glm-5',
        'glm-4-plus',
        'glm-4-air'
      ]
    },
    {
      id: 'zai',
      name: 'Z.AI',
      models: [
        'glm-5',
        'glm-4.7',
        'glm-4.5-air'
      ]
    },
    {
      id: 'r9s',
      name: 'R9S.AI',
      models: [
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'claude-haiku-4-5'
      ]
    },
    {
      id: 'moonshot',
      name: 'Moonshot (月之暗面 v2)',
      models: [
        'kimi-k2.5',
        'kimi-k2-thinking',
        'kimi-k2-thinking-turbo'
      ]
    },
    {
      id: 'perplexity',
      name: 'Perplexity (Web Search)',
      models: [
        'sonar',
        'sonar-pro'
      ]
    }
  ];
};

/**
 * Check if a provider is configured (has API key)
 */
const PROVIDER_KEY_MAP: Record<AIProvider, string> = {
  openrouter: STORAGE_KEYS.OPENROUTER_API_KEY,
  gemini: STORAGE_KEYS.GEMINI_API_KEY,
  claude: STORAGE_KEYS.CLAUDE_API_KEY,
  openai: STORAGE_KEYS.OPENAI_API_KEY,
  kimi: STORAGE_KEYS.KIMI_API_KEY,
  nvidia: STORAGE_KEYS.NVIDIA_API_KEY,
  deepseek: STORAGE_KEYS.DEEPSEEK_API_KEY,
  groq: STORAGE_KEYS.GROQ_API_KEY,
  dashscope: STORAGE_KEYS.DASHSCOPE_API_KEY,
  minimax: STORAGE_KEYS.MINIMAX_API_KEY,
  zhipu: STORAGE_KEYS.ZHIPU_API_KEY,
  zai: STORAGE_KEYS.ZAI_API_KEY,
  r9s: STORAGE_KEYS.R9S_API_KEY,
  moonshot: STORAGE_KEYS.MOONSHOT_API_KEY,
  perplexity: STORAGE_KEYS.PERPLEXITY_API_KEY,
};

export const isProviderConfigured = (provider: AIProvider): boolean => {
  const key = PROVIDER_KEY_MAP[provider];
  return key ? !!localStorage.getItem(key) : false;
};

/**
 * Test API key for a provider
 */
export const testApiKey = async (provider: AIProvider, apiKey: string, model?: string): Promise<{ success: boolean; error?: string; model?: string }> => {
  if (provider === 'openrouter') {
    return await openrouter.testApiKey(apiKey, model);
  }
  // Other providers don't have test functions yet
  return { success: true };
};

/**
 * Chat with Perplexity for web-grounded responses.
 * Used by the "Web Search" toggle — bypasses normal provider routing.
 */
export const chatWithPerplexity = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; model?: string } = {}
): Promise<{ text: string; model?: string; provider: string; citations?: string[] }> => {
  const result = await perplexity.chatWithAI(prompt, history, options);
  return { text: result.text, model: options.model || 'sonar', provider: 'Perplexity', citations: result.citations };
};

/**
 * Web search provider type
 */
export type WebSearchProvider = 'perplexity' | 'tavily' | 'firecrawl' | 'exa' | 'brave';

const WEB_SEARCH_KEY_MAP: Record<WebSearchProvider, string> = {
  perplexity: STORAGE_KEYS.PERPLEXITY_API_KEY,
  tavily: STORAGE_KEYS.TAVILY_API_KEY,
  firecrawl: STORAGE_KEYS.FIRECRAWL_API_KEY,
  exa: STORAGE_KEYS.EXA_API_KEY,
  brave: STORAGE_KEYS.BRAVE_API_KEY,
};

/**
 * Check if a web search provider has an API key configured
 */
export const isWebSearchProviderConfigured = (provider: WebSearchProvider): boolean => {
  const key = WEB_SEARCH_KEY_MAP[provider];
  return key ? !!localStorage.getItem(key) : false;
};

/**
 * Get list of configured web search providers
 */
export const getConfiguredWebSearchProviders = (): WebSearchProvider[] => {
  return (['perplexity', 'tavily', 'firecrawl', 'exa', 'brave'] as WebSearchProvider[])
    .filter(p => isWebSearchProviderConfigured(p));
};

/**
 * Search with Tavily
 */
export const searchWithTavily = async (
  query: string,
  options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; provider: string; citations?: string[] }> => {
  const result = await tavily.searchWithTavily(query, options);
  return { text: result.text, provider: 'Tavily', citations: result.citations };
};

/**
 * Search with Firecrawl
 */
export const searchWithFirecrawl = async (
  query: string,
  options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; provider: string; citations?: string[] }> => {
  const result = await firecrawl.searchWithFirecrawl(query, options);
  return { text: result.text, provider: 'Firecrawl', citations: result.citations };
};

/**
 * Search with Exa
 */
export const searchWithExa = async (
  query: string,
  options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; provider: string; citations?: string[] }> => {
  const result = await exa.searchWithExa(query, options);
  return { text: result.text, provider: 'Exa', citations: result.citations };
};

/**
 * Search with Brave
 */
export const searchWithBrave = async (
  query: string,
  options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; provider: string; citations?: string[] }> => {
  const result = await brave.searchWithBrave(query, options);
  return { text: result.text, provider: 'Brave', citations: result.citations };
};

/**
 * Synthesize search results through the user's primary AI provider.
 * For non-Perplexity search providers, the raw results are sent to the AI
 * to generate a coherent, contextual answer.
 */
const synthesizeWithAI = async (
  query: string,
  searchResults: Array<{ title: string; content: string; url: string }>,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean } = {}
): Promise<string> => {
  const context = searchResults
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`)
    .join('\n\n');

  const synthesisPrompt = `Based on the following web search results, provide a comprehensive answer to the question: "${query}"

SEARCH RESULTS:
${context}

INSTRUCTIONS:
- Synthesize the information from the search results into a clear, coherent answer
- Cite sources by number [1], [2], etc. when referencing specific information
- Respond in both Chinese and English, separated by [SPLIT]
- Be concise but thorough`;

  const result = await chatWithAI(synthesisPrompt, history, { ...options, search: false });
  const text = typeof result === 'string' ? result : result.text;
  return text;
};

/**
 * Unified web search function that routes to the appropriate provider.
 * For Perplexity, uses its built-in LLM answer.
 * For others, fetches raw results and synthesizes through the user's primary AI provider.
 */
export const webSearch = async (
  query: string,
  provider: WebSearchProvider,
  history: { role: string; content: string }[] = [],
  options: { thinking?: boolean; fast?: boolean; model?: string } = {}
): Promise<{ text: string; model?: string; provider: string; citations?: string[] }> => {
  if (provider === 'perplexity') {
    return chatWithPerplexity(query, history, options);
  }

  // For non-Perplexity providers: fetch raw results, then synthesize with AI
  let rawResults: Array<{ title: string; content: string; url: string }>;
  let citations: string[];
  let providerName: string;

  switch (provider) {
    case 'tavily': {
      const raw = await tavily.getRawResults(query);
      rawResults = raw.results;
      citations = rawResults.map(r => r.url).filter(Boolean);
      providerName = 'Tavily';
      // If Tavily returned its own answer, use it directly
      if (raw.answer) {
        const formatted = raw.answer + formatCitationsInline(citations);
        return { text: formatted, provider: providerName, citations };
      }
      break;
    }
    case 'firecrawl': {
      const raw = await firecrawl.getRawResults(query);
      rawResults = raw.results;
      citations = rawResults.map(r => r.url).filter(Boolean);
      providerName = 'Firecrawl';
      break;
    }
    case 'exa': {
      const raw = await exa.getRawResults(query);
      rawResults = raw.results;
      citations = rawResults.map(r => r.url).filter(Boolean);
      providerName = 'Exa';
      break;
    }
    case 'brave': {
      const raw = await brave.getRawResults(query);
      rawResults = raw.results;
      citations = rawResults.map(r => r.url).filter(Boolean);
      providerName = 'Brave';
      break;
    }
    default:
      throw new Error(`Unknown web search provider: ${provider}`);
  }

  if (rawResults.length === 0) {
    return { text: 'No search results found.', provider: providerName, citations: [] };
  }

  // Synthesize the raw results through the user's primary AI
  const synthesized = await synthesizeWithAI(query, rawResults, history, options);
  const text = synthesized + formatCitationsInline(citations);

  return { text, provider: providerName, citations };
};

/**
 * Format citations inline for appending to synthesized text
 */
function formatCitationsInline(citations: string[]): string {
  if (!citations || citations.length === 0) return '';
  let section = '\n\n---\n**Sources / 参考来源:**\n';
  citations.forEach((url, i) => {
    let domain = url;
    try {
      domain = new URL(url).hostname.replace('www.', '');
    } catch { /* keep original */ }
    section += `${i + 1}. [${domain}](${url})\n`;
  });
  return section;
}

// Re-export other services from gemini (image, video, TTS, etc.)
// These remain Gemini-only for now
export {
  generateImage,
  editImage,
  generateVideo,
  speak,
  stopSpeech,
  analyzeMedia
} from './gemini';
