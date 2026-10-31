/**
 * aiDefaults.test.ts — the models the app names in its AI requests · AI 默认模型测试
 *
 * The default ids, the free-router alias, and the readers: the constant when
 * nothing (or junk) is stored, a stored/synced choice otherwise. Nothing in
 * the app writes a choice since the own-key path was removed (ADR-0007,
 * 2026-10-23): no setter, no key saver is exported. Uses a real in-memory
 * storage stub (the global setup's localStorage is a bare vi.fn mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import * as aiDefaults from '../aiDefaults';
import {
  DEFAULT_AI_SETUP, FREE_MODELS_ROUTER_ID, ASK_AI_MODEL, PACK_GENERATION_MODEL, ASK_AI_FALLBACK_MODELS, wireModelId,
  askAIModel, packGenerationModel, askAIFallbackModels, parseModelList,
} from '../aiDefaults';
import { FREE_ROUTER_MODEL } from '../openrouter';

function useStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

beforeEach(() => useStorage());

describe('defaults', () => {
  it('Ask AI: the low-cost reliable model (ADR-0003 → Models), a concrete id', () => {
    expect(DEFAULT_AI_SETUP).toEqual({ provider: 'openrouter', model: ASK_AI_MODEL });
    expect(ASK_AI_MODEL).toBe('google/gemini-2.5-flash');
    expect(wireModelId(ASK_AI_MODEL)).toBe(ASK_AI_MODEL);
  });

  it('pack generation uses its own quality-first model, distinct from Ask AI', () => {
    expect(PACK_GENERATION_MODEL).toBe('anthropic/claude-sonnet-4.5');
    expect(PACK_GENERATION_MODEL).not.toBe(ASK_AI_MODEL);
  });

  it('the free-router alias maps to the wire id and is the last fallback', () => {
    expect(wireModelId(FREE_MODELS_ROUTER_ID)).toBe(FREE_ROUTER_MODEL);
    expect(ASK_AI_FALLBACK_MODELS[ASK_AI_FALLBACK_MODELS.length - 1]).toBe(FREE_ROUTER_MODEL);
    expect(ASK_AI_FALLBACK_MODELS).not.toContain(ASK_AI_MODEL);
    expect(new Set(ASK_AI_FALLBACK_MODELS).size).toBe(ASK_AI_FALLBACK_MODELS.length);
  });

  it('no own-key or model-setting writer is left', () => {
    for (const gone of ['saveOpenRouterKey', 'applyDefaultAISetup', 'hasChosenProvider', 'OPENROUTER_KEYS_URL',
      'setAskAIModel', 'setPackGenerationModel', 'setAskAIFallbackModels']) {
      expect(aiDefaults).not.toHaveProperty(gone);
    }
  });
});

describe('readers', () => {
  it('askAIModel: the constant when nothing is stored, the provider is not OpenRouter, or the id is blank', () => {
    expect(askAIModel()).toBe(ASK_AI_MODEL);
    useStorage({ [STORAGE_KEYS.AI_PROVIDER]: 'claude', [STORAGE_KEYS.AI_MODEL]: 'x/y' });
    expect(askAIModel()).toBe(ASK_AI_MODEL);
    useStorage({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: '   ' });
    expect(askAIModel()).toBe(ASK_AI_MODEL);
  });

  it('askAIModel: a stored OpenRouter choice (alias kept; callers map it to the wire id)', () => {
    useStorage({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: FREE_MODELS_ROUTER_ID });
    expect(askAIModel()).toBe(FREE_MODELS_ROUTER_ID);
  });

  it('packGenerationModel: the constant when absent or blank, the trimmed stored id otherwise', () => {
    expect(packGenerationModel()).toBe(PACK_GENERATION_MODEL);
    useStorage({ [STORAGE_KEYS.AI_PACK_MODEL]: '  ' });
    expect(packGenerationModel()).toBe(PACK_GENERATION_MODEL);
    useStorage({ [STORAGE_KEYS.AI_PACK_MODEL]: ' deepseek/deepseek-chat-v3-0324 ' });
    expect(packGenerationModel()).toBe('deepseek/deepseek-chat-v3-0324');
  });

  it('askAIFallbackModels: the constant list when absent, blank or commas only; the parsed list otherwise', () => {
    expect(askAIFallbackModels()).toBe(ASK_AI_FALLBACK_MODELS);
    useStorage({ [STORAGE_KEYS.AI_FALLBACK_MODELS]: ' , ,' });
    expect(askAIFallbackModels()).toBe(ASK_AI_FALLBACK_MODELS);
    useStorage({ [STORAGE_KEYS.AI_FALLBACK_MODELS]: ' x/one ,y/two,, ' });
    expect(askAIFallbackModels()).toEqual(['x/one', 'y/two']);
    expect(parseModelList('a, b,,c ')).toEqual(['a', 'b', 'c']);
  });
});
