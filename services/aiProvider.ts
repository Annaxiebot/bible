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
import { STORAGE_KEYS } from '../constants/storageKeys';

export type AIProvider = 'gemini' | 'claude' | 'kimi' | 'openai';
export type AIModel = 'claude-haiku-4-5' | 'claude-sonnet-4-5' | 'claude-opus-4-5' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview' | 'gemini-flash-lite-latest' | 'moonshot-v1-128k' | 'gpt-4o' | 'gpt-4o-mini';

// Storage keys
const PROVIDER_KEY = STORAGE_KEYS.AI_PROVIDER;
const MODEL_KEY = STORAGE_KEYS.AI_MODEL;

/**
 * Get the current AI provider from settings
 */
export const getCurrentProvider = (): AIProvider => {
  const stored = localStorage.getItem(PROVIDER_KEY);
  return (stored === 'claude' || stored === 'gemini' || stored === 'kimi' || stored === 'openai') ? stored : 'gemini';
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
  
  if (provider === 'claude') {
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
export const getAvailableProviders = (): { id: AIProvider; name: string; models: AIModel[] }[] => {
  return [
    {
      id: 'gemini',
      name: 'Google Gemini',
      models: [
        'gemini-3-flash-preview' as AIModel,
        'gemini-3-pro-preview' as AIModel,
        'gemini-flash-lite-latest' as AIModel
      ]
    },
    {
      id: 'claude',
      name: 'Anthropic Claude',
      models: [
        'claude-haiku-4-5' as AIModel,
        'claude-sonnet-4-5' as AIModel,
        'claude-opus-4-5' as AIModel
      ]
    },
    {
      id: 'openai',
      name: 'OpenAI ChatGPT',
      models: [
        'gpt-4o' as AIModel,
        'gpt-4o-mini' as AIModel
      ]
    },
    {
      id: 'kimi',
      name: 'Kimi Moonshot (月之暗面)',
      models: [
        'moonshot-v1-128k' as AIModel
      ]
    }
  ];
};

/**
 * Check if a provider is configured (has API key)
 */
export const isProviderConfigured = (provider: AIProvider): boolean => {
  if (provider === 'gemini') {
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
