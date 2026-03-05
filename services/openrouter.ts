/**
 * OpenRouter API Service
 * 
 * Unified gateway to access multiple AI models through OpenRouter.
 * Supports free models (Gemini Flash, Llama 3.1, Mistral) and premium models.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * OpenRouter free models
 */
export const FREE_MODELS = [
  { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5 (Free)', provider: 'Google' },
  { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)', provider: 'Meta' },
  { id: 'meta-llama/llama-3.1-70b-instruct:free', name: 'Llama 3.1 70B (Free)', provider: 'Meta' },
  { id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B (Free)', provider: 'Mistral' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' },
  { id: 'qwen/qwen-2-7b-instruct:free', name: 'Qwen 2 7B (Free)', provider: 'Alibaba' },
];

/**
 * OpenRouter premium models (requires credits)
 */
export const PREMIUM_MODELS = [
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'Anthropic' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
  { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google' },
];

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
export const testApiKey = async (apiKey: string): Promise<{ success: boolean; error?: string; model?: string }> => {
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
        model: 'google/gemini-flash-1.5', // Use free model for testing
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
      model: data.model || 'google/gemini-flash-1.5',
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

  // Default to free Gemini Flash model
  const model = options.model || 'google/gemini-flash-1.5';

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
