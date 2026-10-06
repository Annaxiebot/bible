/**
 * obsoleteStorageKeys.ts — clear what the removed multi-provider AI left behind · 清除旧 AI 设置
 *
 * The direct-provider AI stack (Gemini, Claude, OpenAI, Kimi, the
 * multi-provider settings panel, web-search providers) was deleted on
 * 2026-10-05 (ADR-0007 "Personal app"). Browsers that used it still hold its
 * API keys and toggles in localStorage. Nothing reads them any more, and an
 * API key should not linger where nothing uses it, so they are removed once
 * per page load. Removing an absent key is a no-op, so running every start
 * is safe and needs no "already done" flag.
 *
 * Kept on purpose: openrouter_api_key (the hidden "Advanced" own-key path
 * reads it), ai_provider / ai_model (services/aiDefaults reads them).
 */

/** localStorage keys written only by the removed AI code. This file is their one source (R3). */
export const OBSOLETE_AI_STORAGE_KEYS: readonly string[] = [
  // API keys of the removed providers
  'gemini_api_key', 'claude_api_key', 'openai_api_key', 'kimi_api_key',
  'nvidia_api_key', 'deepseek_api_key', 'groq_api_key', 'dashscope_api_key',
  'minimax_api_key', 'zhipu_api_key', 'zai_api_key', 'r9s_api_key', 'moonshot_api_key',
  // Web-search provider keys and the provider choice
  'perplexity_api_key', 'tavily_api_key', 'firecrawl_api_key', 'exa_api_key', 'brave_api_key',
  'selectedWebSearchProvider', 'webSearchProvider',
  // Toggles of the removed multi-provider settings panel
  'useFreeRouter', 'useServerAI', 'autoRaceAI',
];

/**
 * Best-effort removal of OBSOLETE_AI_STORAGE_KEYS. Never throws: storage can
 * be unavailable (private mode, blocked site data) and a failed cleanup must
 * not stop the app from starting.
 */
export function removeObsoleteAIStorageKeys(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    for (const key of OBSOLETE_AI_STORAGE_KEYS) storage.removeItem(key);
  } catch {
    // R5: silent on purpose — the keys are unread leftovers; if storage refuses access the
    // app works the same, and the next start tries again.
  }
}
