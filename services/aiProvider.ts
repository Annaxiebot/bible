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
  return stored && VALID_MODELS.includes(stored) ? (stored as AIModel) : null;
};

/**
 * Set the AI model
 */
export const setModel = (model: AIModel): void => {
  localStorage.setItem(MODEL_KEY, model);
};

/**
 * Text Chat with AI - Routes to appropriate provider
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string } } = {}
) => {
  const provider = getCurrentProvider();
  const model = getCurrentModel();
  
  if (provider === 'openrouter') {
    return await openrouter.chatWithAI(prompt, history, { ...options, model: model || undefined });
  } else if (provider === 'claude') {
    return await claude.chatWithAI(prompt, history, options);
  } else if (provider === 'kimi') {
    return await kimi.chatWithAI(prompt, history, options);
  } else if (provider === 'openai') {
    return await openai.chatWithAI(prompt, history, options);
  } else {
    return await gemini.chatWithAI(prompt, history, options);
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
export const testApiKey = async (provider: AIProvider, apiKey: string): Promise<{ success: boolean; error?: string; model?: string }> => {
  if (provider === 'openrouter') {
    return await openrouter.testApiKey(apiKey);
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
