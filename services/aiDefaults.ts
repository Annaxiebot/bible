/**
 * aiDefaults.ts — what a brand-new visitor gets without choosing anything · AI 默认设置
 *
 * Single source (R3) for the out-of-the-box AI setup: provider OpenRouter,
 * model = OpenRouter's free-models router. Imported by services/aiProvider
 * (fallback when nothing is stored), components/AIProviderSettings (the
 * advanced panel) and components/setup (the one-field key dialog), so the
 * three can never disagree. Pure module (no React) so tests and Playwright
 * specs can import it.
 *
 * Existing stored choices are never overwritten: applyDefaultAISetup() is a
 * no-op once a provider has been chosen.
 */
import { STORAGE_KEYS } from '../constants/storageKeys';
import { FREE_ROUTER_MODEL } from './openrouter';

/**
 * OpenRouter model id that routes to the best available free model. The
 * app maps it to OpenRouter's free router (services/aiProvider →
 * services/openrouter FREE_ROUTER_MODEL); the server proxy knows it too.
 */
export const FREE_MODELS_ROUTER_ID = 'openrouter/auto:free';

/** Where a visitor creates an OpenRouter key. Opened in a new tab; never carries the key. */
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

/** The id actually sent to OpenRouter for a stored model choice (the app-side router alias → wire id). */
export function wireModelId(modelId: string): string {
  return modelId === FREE_MODELS_ROUTER_ID ? FREE_ROUTER_MODEL : modelId;
}

export const DEFAULT_AI_SETUP = {
  provider: 'openrouter',
  model: FREE_MODELS_ROUTER_ID,
} as const;

/** True once the user (or applyDefaultAISetup) has stored a provider choice. */
export function hasChosenProvider(): boolean {
  return localStorage.getItem(STORAGE_KEYS.AI_PROVIDER) !== null;
}

/**
 * Store the defaults — only when no provider has been chosen yet. Called
 * after the quick setup saves a key, so the key alone is enough to chat.
 */
export function applyDefaultAISetup(): void {
  if (hasChosenProvider()) return;
  localStorage.setItem(STORAGE_KEYS.AI_PROVIDER, DEFAULT_AI_SETUP.provider);
  localStorage.setItem(STORAGE_KEYS.AI_MODEL, DEFAULT_AI_SETUP.model);
}

/**
 * The model the settings panel should show as selected on open: the stored
 * choice if any, the default router for a user who has chosen nothing, and
 * "" (provider default) for a user who chose a provider but no model.
 */
export function initialModelChoice(): string {
  const stored = localStorage.getItem(STORAGE_KEYS.AI_MODEL);
  if (stored) return stored;
  return hasChosenProvider() ? '' : DEFAULT_AI_SETUP.model;
}

/** Save an OpenRouter key (same storage key the advanced panel uses) and apply the defaults. */
export function saveOpenRouterKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) throw new Error('OpenRouter key is empty');
  localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, trimmed);
  applyDefaultAISetup();
}
