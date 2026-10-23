/**
 * obsoleteStorageKeys.test.ts — the start-up cleanup of the removed AI stack's keys.
 *
 * Uses a real in-memory storage (the global setup's localStorage is a bare vi.fn mock).
 */
import { describe, it, expect } from 'vitest';
import { OBSOLETE_AI_STORAGE_KEYS, OWN_OPENROUTER_KEY, removeObsoleteAIStorageKeys } from '../obsoleteStorageKeys';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { SYNCED_SETTINGS_KEYS } from '../syncService';

function makeStorage(initial: Record<string, string>) {
  const store = { ...initial };
  return {
    removeItem: (k: string) => { delete store[k]; },
    dump: () => ({ ...store }),
  };
}

describe('removeObsoleteAIStorageKeys', () => {
  it('removes every obsolete key — the own OpenRouter key too — and keeps the model choice and unrelated data', () => {
    const kept = {
      [STORAGE_KEYS.AI_PROVIDER]: 'openrouter',
      [STORAGE_KEYS.AI_MODEL]: 'google/gemini-2.5-flash',
      [STORAGE_KEYS.FONT_SIZE]: '18',
    };
    const obsolete = Object.fromEntries(OBSOLETE_AI_STORAGE_KEYS.map(k => [k, 'old']));
    const storage = makeStorage({ ...kept, ...obsolete, [OWN_OPENROUTER_KEY]: 'sk-or-own' });

    removeObsoleteAIStorageKeys(storage);

    expect(storage.dump()).toEqual(kept);
  });

  it('the own key is obsolete since sign-in became the one way to use AI (ADR-0007, 2026-10-23)', () => {
    expect(OWN_OPENROUTER_KEY).toBe('openrouter_api_key');
    expect(OBSOLETE_AI_STORAGE_KEYS).toContain(OWN_OPENROUTER_KEY);
  });

  it('is a no-op on a browser that never had them, and safe to run again', () => {
    const storage = makeStorage({ [STORAGE_KEYS.FONT_SIZE]: '18' });
    removeObsoleteAIStorageKeys(storage);
    removeObsoleteAIStorageKeys(storage);
    expect(storage.dump()).toEqual({ [STORAGE_KEYS.FONT_SIZE]: '18' });
  });

  it('never throws when storage refuses access (private mode, blocked site data)', () => {
    const refusing = { removeItem: () => { throw new DOMException('denied', 'SecurityError'); } };
    expect(() => removeObsoleteAIStorageKeys(refusing)).not.toThrow();
  });

  it('never lists a key the live app still uses', () => {
    const live: string[] = [...Object.values(STORAGE_KEYS), ...SYNCED_SETTINGS_KEYS];
    expect(OBSOLETE_AI_STORAGE_KEYS.filter(k => live.includes(k))).toEqual([]);
  });
});
