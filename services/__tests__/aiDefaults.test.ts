/**
 * aiDefaults.test.ts — out-of-the-box AI setup · AI 默认设置测试
 *
 * A brand-new visitor gets OpenRouter + the free-models router after the
 * one-field setup; a user who already chose a provider/model is never
 * overwritten. Uses a real in-memory storage stub (the global setup's
 * localStorage is a bare vi.fn mock).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import {
  DEFAULT_AI_SETUP, FREE_MODELS_ROUTER_ID, OPENROUTER_KEYS_URL, ASK_AI_MODEL, PACK_GENERATION_MODEL,
  ASK_AI_FALLBACK_MODELS, wireModelId,
  applyDefaultAISetup, applyRecommendedModel, hasChosenProvider, initialModelChoice, saveOpenRouterKey,
} from '../aiDefaults';
import { getCurrentProvider, getCurrentModel } from '../aiProvider';
import { FREE_ROUTER_MODEL } from '../openrouter';

function makeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    dump: () => ({ ...store }),
  };
}

let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal('localStorage', storage);
});

describe('DEFAULT_AI_SETUP', () => {
  it('is OpenRouter with the low-cost reliable Ask-AI model (ADR-0003 → Models)', () => {
    expect(DEFAULT_AI_SETUP).toEqual({ provider: 'openrouter', model: ASK_AI_MODEL });
    expect(ASK_AI_MODEL).toBe('google/gemini-2.5-flash');
    expect(wireModelId(ASK_AI_MODEL)).toBe(ASK_AI_MODEL); // a concrete id, not an alias
  });

  it('pack generation uses its own quality-first model, distinct from Ask AI', () => {
    expect(PACK_GENERATION_MODEL).toBe('anthropic/claude-sonnet-4.5');
    expect(PACK_GENERATION_MODEL).not.toBe(ASK_AI_MODEL);
  });

  it('keeps the free router selectable: the alias maps to the wire id and is the last fallback', () => {
    expect(wireModelId(FREE_MODELS_ROUTER_ID)).toBe(FREE_ROUTER_MODEL);
    expect(ASK_AI_FALLBACK_MODELS[ASK_AI_FALLBACK_MODELS.length - 1]).toBe(FREE_ROUTER_MODEL);
    expect(ASK_AI_FALLBACK_MODELS).not.toContain(ASK_AI_MODEL);
    expect(new Set(ASK_AI_FALLBACK_MODELS).size).toBe(ASK_AI_FALLBACK_MODELS.length);
  });

  it('is the provider aiProvider falls back to when nothing is stored', () => {
    expect(getCurrentProvider()).toBe(DEFAULT_AI_SETUP.provider);
  });

  it('points the "get a key" link at OpenRouter over https', () => {
    expect(OPENROUTER_KEYS_URL).toMatch(/^https:\/\/openrouter\.ai\//);
  });
});

describe('applyDefaultAISetup', () => {
  it('stores provider + model for a new user', () => {
    expect(hasChosenProvider()).toBe(false);
    applyDefaultAISetup();
    expect(getCurrentProvider()).toBe(DEFAULT_AI_SETUP.provider);
    expect(getCurrentModel()).toBe(DEFAULT_AI_SETUP.model);
  });

  it('never overwrites an existing provider/model choice', () => {
    storage = makeStorage({ [STORAGE_KEYS.AI_PROVIDER]: 'claude', [STORAGE_KEYS.AI_MODEL]: 'claude-sonnet-4-5' });
    vi.stubGlobal('localStorage', storage);
    applyDefaultAISetup();
    expect(getCurrentProvider()).toBe('claude');
    expect(getCurrentModel()).toBe('claude-sonnet-4-5');
  });

  it('leaves a chosen provider with no model alone (provider default stays)', () => {
    storage = makeStorage({ [STORAGE_KEYS.AI_PROVIDER]: 'gemini' });
    vi.stubGlobal('localStorage', storage);
    applyDefaultAISetup();
    expect(storage.dump()).toEqual({ [STORAGE_KEYS.AI_PROVIDER]: 'gemini' });
  });
});

describe('applyRecommendedModel (the one-tap switch in the saved-key dialog)', () => {
  it('overwrites a stored free-router choice with provider + recommended model', () => {
    storage = makeStorage({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter', [STORAGE_KEYS.AI_MODEL]: FREE_MODELS_ROUTER_ID });
    vi.stubGlobal('localStorage', storage);
    applyRecommendedModel();
    expect(getCurrentProvider()).toBe(DEFAULT_AI_SETUP.provider);
    expect(getCurrentModel()).toBe(ASK_AI_MODEL);
  });
});

describe('initialModelChoice (what the settings panel shows selected)', () => {
  it('is the recommended model for a user who chose nothing', () => {
    expect(initialModelChoice()).toBe(ASK_AI_MODEL);
  });
  it('is "" (provider default) for a user who chose a provider but no model', () => {
    storage.setItem(STORAGE_KEYS.AI_PROVIDER, 'gemini');
    expect(initialModelChoice()).toBe('');
  });
  it('is the stored model when one exists', () => {
    storage.setItem(STORAGE_KEYS.AI_PROVIDER, 'openrouter');
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'openai/gpt-4o');
    expect(initialModelChoice()).toBe('openai/gpt-4o');
  });
});

describe('saveOpenRouterKey', () => {
  it('stores the trimmed key under the existing storage key and applies the defaults', () => {
    saveOpenRouterKey('  sk-or-abc  ');
    expect(storage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY)).toBe('sk-or-abc');
    expect(getCurrentProvider()).toBe(DEFAULT_AI_SETUP.provider);
    expect(getCurrentModel()).toBe(DEFAULT_AI_SETUP.model);
  });

  it('keeps an existing provider choice while still storing the key', () => {
    storage.setItem(STORAGE_KEYS.AI_PROVIDER, 'gemini');
    saveOpenRouterKey('sk-or-abc');
    expect(storage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY)).toBe('sk-or-abc');
    expect(getCurrentProvider()).toBe('gemini');
  });

  it('rejects an empty key instead of storing it', () => {
    expect(() => saveOpenRouterKey('   ')).toThrow(/empty/);
    expect(storage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY)).toBeNull();
  });
});
