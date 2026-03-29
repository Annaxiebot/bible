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

export type AIProvider = 'gemini' | 'claude' | 'kimi' | 'openai' | 'openrouter';
export type AIModel = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-flash-lite-latest' | 'moonshot-v1-128k' | 'gpt-4o' | 'gpt-4o-mini' | string;

// Storage keys
const PROVIDER_KEY = STORAGE_KEYS.AI_PROVIDER;
const MODEL_KEY = STORAGE_KEYS.AI_MODEL;

/**
 * Get the current AI provider from settings
 */
export const getCurrentProvider = (): AIProvider => {
  const stored = localStorage.getItem(PROVIDER_KEY);
  return (stored === 'claude' || stored === 'gemini' || stored === 'kimi' || stored === 'openai' || stored === 'openrouter') ? stored : 'gemini';
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
  const providerNames: Record<AIProvider, string> = {
    openrouter: 'OpenRouter',
    gemini: 'Gemini',
    claude: 'Claude',
    openai: 'OpenAI',
    kimi: 'Kimi',
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
  const all: AIProvider[] = ['openrouter', 'gemini', 'claude', 'openai', 'kimi'];
  return all.filter(p => p !== primary && isProviderConfigured(p));
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
    }
  ];
};

/**
 * Check if a provider is configured (has API key)
 */
export const isProviderConfigured = (provider: AIProvider): boolean => {
  if (provider === 'openrouter') {
    return !!localStorage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY);
  } else if (provider === 'gemini') {
    return !!(import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || process.env.API_KEY);
  } else if (provider === 'claude') {
    // Claude API key must be user-provided (never from environment/secrets)
    return !!localStorage.getItem(STORAGE_KEYS.CLAUDE_API_KEY);
  } else if (provider === 'openai') {
    return !!(import.meta.env.VITE_OPENAI_API_KEY || localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || process.env.OPENAI_API_KEY);
  } else if (provider === 'kimi') {
    return !!(import.meta.env.VITE_KIMI_API_KEY || localStorage.getItem(STORAGE_KEYS.KIMI_API_KEY) || process.env.KIMI_API_KEY);
  }
  return false;
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
