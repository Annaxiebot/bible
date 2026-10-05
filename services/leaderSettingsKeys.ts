/**
 * leaderSettingsKeys.ts — which settings a signed-in leader syncs · 同步键
 *
 * The single list (R3) of localStorage keys mirrored to the leader_settings
 * row (database/leader-settings-schema.sql, ADR-0005), and the change bus
 * the writers ring. Pure module — no Supabase, no React — so the writers
 * (services/aiDefaults, components/newstudy/*Default.ts) and the Playwright
 * specs that import them stay free of services/supabase. The actual sync
 * (services/leaderSettings) registers itself as the one listener at start.
 *
 * NOT synced, on purpose: the OpenRouter API key (stays in the browser,
 * never written to the row) and the provider (always OpenRouter for Ask AI).
 */
import { STORAGE_KEYS } from '../constants/storageKeys';

export const LEADER_SYNCED_KEYS = [
  STORAGE_KEYS.AI_MODEL,
  STORAGE_KEYS.AI_PACK_MODEL,
  STORAGE_KEYS.AI_FALLBACK_MODELS,
  STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT,
] as const;

export type LeaderSyncedKey = (typeof LEADER_SYNCED_KEYS)[number];

export function isLeaderSyncedKey(key: string): key is LeaderSyncedKey {
  return (LEADER_SYNCED_KEYS as readonly string[]).includes(key);
}

type ChangeListener = (key: LeaderSyncedKey) => void;
let listener: ChangeListener | null = null;

/** Registered by services/leaderSettings at start (null to detach). One listener: the sync. */
export function setLeaderSettingListener(next: ChangeListener | null): void {
  listener = next;
}

/**
 * Writers call this right after storing a value (or clearing it). A key
 * outside the synced list, or no sync started yet, is a no-op — a brand-new
 * visitor's local-only edits must never error.
 */
export function noteLeaderSettingChanged(key: string): void {
  if (isLeaderSyncedKey(key)) listener?.(key);
}
