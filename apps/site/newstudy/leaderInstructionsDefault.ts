/**
 * leaderInstructionsDefault.ts — the leader's standing AI instructions · 组长定制
 *
 * Free text the leader wants every generated pack to honor (emphases, question
 * style, their group's needs). Remembered like the content language (localStorage
 * + leader-settings sync, ADR-0005) and injected into the generation prompt as
 * fenced data (packPrompt). Capped: untrusted free text never grows the prompt
 * without bound (one fail-closed cap, not per-case meters).
 */
import { STORAGE_KEYS } from '../../../shared/constants/storageKeys';
import { noteLeaderSettingChanged } from '../../../shared/services/leaderSettingsKeys';

export const LEADER_INSTRUCTIONS_MAX_CHARS = 500;

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

export function readLeaderInstructions(store: KeyStore = window.localStorage): string {
  return (store.getItem(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS) ?? '').slice(0, LEADER_INSTRUCTIONS_MAX_CHARS);
}

/** Every generation remembers the text (trimmed, capped); the next form opens on it. The sync is told. */
export function rememberLeaderInstructions(text: string, store: KeyStore = window.localStorage): void {
  store.setItem(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS, text.trim().slice(0, LEADER_INSTRUCTIONS_MAX_CHARS));
  noteLeaderSettingChanged(STORAGE_KEYS.LEADER_AI_INSTRUCTIONS);
}
