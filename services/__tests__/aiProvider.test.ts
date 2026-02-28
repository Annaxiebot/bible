import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCurrentProvider,
  setProvider,
  getCurrentModel,
  setModel,
  isProviderConfigured,
  getAvailableProviders,
} from '../aiProvider';

// ---------------------------------------------------------------------------
// localStorage stub
// ---------------------------------------------------------------------------

function makeStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aiProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage());
    vi.stubGlobal('import', { meta: { env: {} } });
  });

  // getCurrentProvider
  describe('getCurrentProvider', () => {
    it('returns "gemini" when no provider is stored', () => {
      expect(getCurrentProvider()).toBe('gemini');
    });

    it('returns stored provider when valid', () => {
      vi.stubGlobal('localStorage', makeStorage({ ai_provider: 'claude' }));
      expect(getCurrentProvider()).toBe('claude');
    });

    it('returns "gemini" for unknown stored value', () => {
      vi.stubGlobal('localStorage', makeStorage({ ai_provider: 'unknown-provider' }));
      expect(getCurrentProvider()).toBe('gemini');
    });

    it('recognises all four valid providers', () => {
      for (const p of ['gemini', 'claude', 'kimi', 'openai'] as const) {
        vi.stubGlobal('localStorage', makeStorage({ ai_provider: p }));
        expect(getCurrentProvider()).toBe(p);
      }
    });
  });

  // setProvider
  describe('setProvider', () => {
    it('persists the provider to localStorage', () => {
      setProvider('kimi');
      expect(getCurrentProvider()).toBe('kimi');
    });
  });

  // getCurrentModel
  describe('getCurrentModel', () => {
    it('returns null when no model is stored', () => {
      expect(getCurrentModel()).toBeNull();
    });

    it('returns a valid stored model', () => {
      vi.stubGlobal('localStorage', makeStorage({ ai_model: 'claude-sonnet-4-5' }));
      expect(getCurrentModel()).toBe('claude-sonnet-4-5');
    });

    it('returns null for an invalid model string', () => {
      vi.stubGlobal('localStorage', makeStorage({ ai_model: 'not-a-real-model' }));
      expect(getCurrentModel()).toBeNull();
    });
  });

  // setModel
  describe('setModel', () => {
    it('persists the model to localStorage', () => {
      setModel('moonshot-v1-128k');
      expect(getCurrentModel()).toBe('moonshot-v1-128k');
    });
  });

  // getAvailableProviders
  describe('getAvailableProviders', () => {
    it('includes gemini, claude, kimi, and openai', () => {
      const ids = getAvailableProviders().map(p => p.id);
      expect(ids).toContain('gemini');
      expect(ids).toContain('claude');
      expect(ids).toContain('kimi');
      expect(ids).toContain('openai');
    });

    it('each provider has at least one model', () => {
      for (const p of getAvailableProviders()) {
        expect(p.models.length).toBeGreaterThan(0);
      }
    });
  });

  // isProviderConfigured
  describe('isProviderConfigured', () => {
    it('returns false for gemini when no key is present', () => {
      expect(isProviderConfigured('gemini')).toBe(false);
    });

    it('returns true for gemini when localStorage key is set', () => {
      vi.stubGlobal('localStorage', makeStorage({ gemini_api_key: 'key123' }));
      expect(isProviderConfigured('gemini')).toBe(true);
    });

    it('returns false for claude when no key is present', () => {
      expect(isProviderConfigured('claude')).toBe(false);
    });

    it('returns true for claude when localStorage key is set', () => {
      vi.stubGlobal('localStorage', makeStorage({ claude_api_key: 'key123' }));
      expect(isProviderConfigured('claude')).toBe(true);
    });

    it('returns false for kimi when no key is present', () => {
      expect(isProviderConfigured('kimi')).toBe(false);
    });

    it('returns true for kimi when localStorage key is set', () => {
      vi.stubGlobal('localStorage', makeStorage({ kimi_api_key: 'key123' }));
      expect(isProviderConfigured('kimi')).toBe(true);
    });

    it('returns false for openai when no key is present', () => {
      expect(isProviderConfigured('openai')).toBe(false);
    });

    it('returns true for openai when localStorage key is set', () => {
      vi.stubGlobal('localStorage', makeStorage({ openai_api_key: 'key123' }));
      expect(isProviderConfigured('openai')).toBe(true);
    });
  });
});
