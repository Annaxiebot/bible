/**
 * OpenRouter API Service
 *
 * Unified gateway to access multiple AI models through OpenRouter.
 * Supports free models and premium models, with dynamic model list fetching.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface OpenRouterModelInfo {
  id: string;
  name: string;
  provider: string;
  isFree: boolean;
}

/** In-memory model cache — avoids redundant fetches within a session */
let modelCache: { models: OpenRouterModelInfo[]; fetchedAt: number } | null = null;

/** Priority order for auto-detection — highest quality / most reliable free models first */
const FREE_MODEL_PRIORITY = [
  'google/gemma-3-27b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

export type AutoDetectProgress = {
  modelId: string;
  modelName: string;
  status: 'testing' | 'success' | 'failed';
};

/**
 * Fetch the live model list from OpenRouter.
 * Results are cached for 5 minutes. Falls back to the caller handling errors.
 * Free models (`:free` suffix or zero pricing) are sorted first.
 */
export const fetchAvailableModels = async (): Promise<OpenRouterModelInfo[]> => {
  if (modelCache && Date.now() - modelCache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return modelCache.models;
  }

  const response = await fetch(OPENROUTER_MODELS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch OpenRouter models: ${response.statusText}`);
  }

  const data = await response.json() as {
    data: Array<{ id: string; name: string; pricing?: { prompt: string; completion: string } }>;
  };

  const models: OpenRouterModelInfo[] = data.data.map(m => {
    const isFree = m.id.endsWith(':free') ||
      (m.pricing?.prompt === '0' && m.pricing?.completion === '0');
    return {
      id: m.id,
      name: m.name || m.id,
      provider: m.id.split('/')[0] ?? '',
      isFree,
    };
  }).sort((a, b) => {
    if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  modelCache = { models, fetchedAt: Date.now() };
  return models;
};

/** Clear the model cache (e.g. for testing or forced refresh) */
export const clearModelCache = (): void => {
  modelCache = null;
};

/**
 * Default model used when no model is explicitly selected
 */
export const DEFAULT_FREE_MODEL = 'google/gemma-3-27b-it:free';

/**
 * OpenRouter free models (verified available as of 2026-03)
 */
export const FREE_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'Meta' },
  { id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B (Free)', provider: 'Meta' },
  { id: 'mistralai/mistral-small-3.1-24b-instruct:free', name: 'Mistral Small 3.1 24B (Free)', provider: 'Mistral' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B (Free)', provider: 'Google' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
];

/**
 * OpenRouter premium models (requires credits)
 */
export const PREMIUM_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google' },
];

/**
 * Test all free models in priority order and return those that respond successfully.
 * The dropdown can then be filtered to only show working models.
 * Returns { working: [...], best: firstWorking | null }.
 */
export const autoDetectBestFreeModel = async (
  apiKey: string,
  onProgress?: (progress: AutoDetectProgress) => void
): Promise<{ working: Array<{ modelId: string; modelName: string }>; best: { modelId: string; modelName: string } | null }> => {
  let freeModels: OpenRouterModelInfo[] = [];
  try {
    const all = await fetchAvailableModels();
    freeModels = all.filter(m => m.isFree);
  } catch {
    freeModels = FREE_MODELS.map(m => ({ ...m, isFree: true }));
  }

  // Priority models first, then remainder sorted alphabetically
  const prioritized: OpenRouterModelInfo[] = [
    ...FREE_MODEL_PRIORITY.map(id => freeModels.find(m => m.id === id)).filter((m): m is OpenRouterModelInfo => !!m),
    ...freeModels.filter(m => !FREE_MODEL_PRIORITY.includes(m.id)),
  ];

  const working: Array<{ modelId: string; modelName: string }> = [];

  for (const model of prioritized) {
    onProgress?.({ modelId: model.id, modelName: model.name, status: 'testing' });
    const timeoutPromise = new Promise<{ success: false; error: string }>(res =>
      setTimeout(() => res({ success: false, error: 'timeout' }), 3000)
    );
    const result = await Promise.race([testApiKey(apiKey, model.id), timeoutPromise]);
    if (result.success) {
      onProgress?.({ modelId: model.id, modelName: model.name, status: 'success' });
      working.push({ modelId: model.id, modelName: model.name });
    } else {
      onProgress?.({ modelId: model.id, modelName: model.name, status: 'failed' });
    }
  }

  return { working, best: working[0] ?? null };
};

/**
 * Get OpenRouter API key
 */
const getApiKey = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY) || 
         import.meta.env.VITE_OPENROUTER_API_KEY || 
         null;
};

/**
 * Test OpenRouter API key
 */
export const testApiKey = async (apiKey: string, model?: string): Promise<{ success: boolean; error?: string; model?: string }> => {
  const testModel = model || DEFAULT_FREE_MODEL;
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Scripture Scholar Test',
      },
      body: JSON.stringify({
        model: testModel,
        messages: [
          { role: 'user', content: 'Say "API key works!" in 3 words or less.' }
        ],
        max_tokens: 10,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return {
      success: true,
      model: data.model || testModel,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Chat with AI via OpenRouter
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { 
    model?: string;
    thinking?: boolean;
    fast?: boolean;
    search?: boolean;
    image?: { data: string; mimeType: string };
  } = {}
): Promise<string> => {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured. Please add your API key in settings.');
  }

  // Default to free Llama 3.3 70B model
  const model = options.model || DEFAULT_FREE_MODEL;

  // Build messages array
  const messages = [
    ...history.map(msg => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    })),
    {
      role: 'user',
      content: options.image 
        ? [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: { url: `data:${options.image.mimeType};base64,${options.image.data}` }
            }
          ]
        : prompt,
    },
  ];

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Scripture Scholar',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: options.fast ? 1000 : 4000,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || `OpenRouter API error: ${response.status}`);
    }

    return data.choices?.[0]?.message?.content || 'No response from AI';
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenRouter API error: ${error.message}`);
    }
    throw new Error('Unknown error calling OpenRouter API');
  }
};
