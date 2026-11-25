import { describe, it, expect, vi } from 'vitest';
import { readLeaderInstructions, rememberLeaderInstructions, LEADER_INSTRUCTIONS_MAX_CHARS } from '../leaderInstructionsDefault';
import { STORAGE_KEYS } from '../../../../shared/constants/storageKeys';
import * as keys from '../../../../shared/services/leaderSettingsKeys';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('leaderInstructionsDefault', () => {
  it('round-trips trimmed text and rings the sync bus', () => {
    const store = memoryStore();
    const spy = vi.spyOn(keys, 'noteLeaderSettingChanged');
    rememberLeaderInstructions('  多联系旧约背景  ', store);
    expect(readLeaderInstructions(store)).toBe('多联系旧约背景');
    expect(spy).toHaveBeenCalledWith(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS);
    spy.mockRestore();
  });

  it('caps stored and read text at the limit (untrusted free text never grows the prompt unbounded)', () => {
    const store = memoryStore();
    rememberLeaderInstructions('长'.repeat(LEADER_INSTRUCTIONS_MAX_CHARS + 50), store);
    expect(readLeaderInstructions(store)).toHaveLength(LEADER_INSTRUCTIONS_MAX_CHARS);
    store.setItem(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS, 'x'.repeat(LEADER_INSTRUCTIONS_MAX_CHARS + 50));
    expect(readLeaderInstructions(store)).toHaveLength(LEADER_INSTRUCTIONS_MAX_CHARS);
  });

  it('first visit reads empty', () => {
    expect(readLeaderInstructions(memoryStore())).toBe('');
  });
});
