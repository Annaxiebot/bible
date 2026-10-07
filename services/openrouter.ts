/**
 * OpenRouter basics for the one AI path (ADR-0007): the chat endpoint, the
 * free-router model id, the user's own key, and the setup dialog's key test.
 * Requests themselves go through services/aiTransport.ts.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Model the key test uses when the caller names none. */
const DEFAULT_FREE_MODEL = 'google/gemma-3-27b-it:free';

/**
 * Special "free router" model that automatically picks the best available free model.
 * OpenRouter's routing system handles model availability dynamically.
 */
export const FREE_ROUTER_MODEL = 'openrouter/free'; // the id OpenRouter's /models lists (not bare "free")

/**
 * Get OpenRouter API key
 */
export const getApiKey = (): string | null => {
  return localStorage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY) ||
         import.meta.env.VITE_OPENROUTER_API_KEY ||
         null;
};

/** Outcome of testApiKey. `status` is the HTTP status of a non-OK reply (absent on success / network failure). */
export interface ApiKeyTestResult {
  success: boolean;
  error?: string;
  model?: string;
  status?: number;
}

/**
 * Test OpenRouter API key
 */
export const testApiKey = async (apiKey: string, model?: string): Promise<ApiKeyTestResult> => {
  const testModel = model || DEFAULT_FREE_MODEL;
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': 'Scripture to Life Test',
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
        status: response.status,
        error: data.error?.message || `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    return {
      success: true,
      model: data.model || testModel,
    };
  } catch (error) {
    // Reported, not swallowed: the setup dialog shows this error next to the key field.
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
