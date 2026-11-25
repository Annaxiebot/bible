/**
 * leaderInstructionsDefault.ts — the leader's standing AI instructions · 组长定制
 *
 * Free text the leader wants every generated pack to honor (emphases, question
 * style, their group's needs). Remembered like the content language (localStorage
 * + leader-settings sync, ADR-0005) and injected into the generation prompt as
 * fenced data. The hard cap and fence strip live in the prompt builder
 * (packPrompt.leaderInstructionsBlock); here the same cap keeps storage small.
 * Blocked storage (even a throwing localStorage getter) never breaks the form.
 */
import { STORAGE_KEYS } from '../../../shared/constants/storageKeys';
import { noteLeaderSettingChanged } from '../../../shared/services/leaderSettingsKeys';
import { LEADER_INSTRUCTIONS_MAX_CHARS } from './packPrompt';

export { LEADER_INSTRUCTIONS_MAX_CHARS };

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

export function readLeaderInstructions(store?: KeyStore): string {
  try {
    const s = store ?? window.localStorage; // inside the try: the accessor itself can throw when storage is blocked
    return (s.getItem(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS) ?? '').slice(0, LEADER_INSTRUCTIONS_MAX_CHARS);
  } catch {
    // Blocked storage: a first-visit empty default, never a broken form.
    return '';
  }
}

/** Every generation remembers the text (trimmed, capped); the next form opens on it. The sync is told. */
export function rememberLeaderInstructions(text: string, store?: KeyStore): void {
  try {
    const s = store ?? window.localStorage;
    s.setItem(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS, text.trim().slice(0, LEADER_INSTRUCTIONS_MAX_CHARS));
    noteLeaderSettingChanged(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS);
  } catch {
    // Blocked storage: this generation still carries the text; it just is not remembered.
  }
}
