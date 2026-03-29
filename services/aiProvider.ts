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
import { STORAGE_KEYS } from '../constants/storageKeys';

export type AIProvider = 'openrouter' | 'gemini' | 'claude' | 'openai' | 'kimi' | 'nvidia' | 'deepseek' | 'groq' | 'dashscope' | 'minimax' | 'zhipu' | 'zai' | 'r9s' | 'moonshot';
export type AIModel = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-flash-lite-latest' | 'moonshot-v1-128k' | 'gpt-4o' | 'gpt-4o-mini' | string;

// Storage keys
const PROVIDER_KEY = STORAGE_KEYS.AI_PROVIDER;
const MODEL_KEY = STORAGE_KEYS.AI_MODEL;

/**
 * Get the current AI provider from settings
 */
const ALL_PROVIDERS: AIProvider[] = ['openrouter', 'gemini', 'claude', 'openai', 'kimi', 'nvidia', 'deepseek', 'groq', 'dashscope', 'minimax', 'zhipu', 'zai', 'r9s', 'moonshot'];

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
  const { supabase, authManager } = await import('./supabase');
  if (!supabase) throw new Error('Supabase not configured');

  const session = authManager.getState().session;
  if (!session?.access_token) throw new Error('Not authenticated');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      prompt,
      history,
      options: {
        ...options,
        useFreeRouter: localStorage.getItem('useFreeRouter') !== 'false',
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Edge function error: ${response.status}`);
  }

  return { text: data.text, model: data.model, provider: data.provider };
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
    r9s: 'R9S.AI', moonshot: 'Moonshot/Kimi',
  };

  if (provider === 'openrouter') {
    const useFreeRouter = localStorage.getItem('useFreeRouter') !== 'false';
    const result = await openrouter.chatWithAI(prompt, history, { ...options, model: options.model || undefined, useFreeRouter });
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
  } else {
    const result = await gemini.chatWithAI(prompt, history, options);
    if (typeof result === 'object' && result !== null && 'candidates' in result) {
      return { text: (result as any).text || String(result), model: options.model || 'gemini', provider: providerNames.gemini, ...(result as any) };
    }
    const text = typeof result === 'string' ? result : (result as any).text || result;
    return { text: String(text), model: options.model || 'gemini', provider: providerNames.gemini };
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
