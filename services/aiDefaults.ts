/**
 * aiDefaults.ts — what a brand-new visitor gets without choosing anything · AI 默认设置
 *
 * Single source (R3) for the out-of-the-box AI setup: provider OpenRouter,
 * model = a low-cost reliable model (ADR-0003 Consequences → Models).
 * Imported by services/aiProvider (fallback when nothing is stored),
 * components/AIProviderSettings (the advanced panel), components/setup (the
 * one-field key dialog) and components/newstudy (pack generation), so they
 * can never disagree. Pure module (no React) so tests and Playwright specs
 * can import it.
 *
 * Existing stored choices are never overwritten: applyDefaultAISetup() is a
 * no-op once a provider has been chosen; applyRecommendedModel() is the one
 * explicit, user-tapped exception.
 */
import { STORAGE_KEYS } from '../constants/storageKeys';
import { FREE_ROUTER_MODEL } from './openrouter';
import { noteLeaderSettingChanged } from './leaderSettingsKeys';

/**
 * OpenRouter model id that routes to the best available free model. The
 * app maps it to OpenRouter's free router (services/aiProvider →
 * services/openrouter FREE_ROUTER_MODEL); the server proxy knows it too.
 * Still selectable in the advanced panel; no longer the default.
 */
export const FREE_MODELS_ROUTER_ID = 'openrouter/auto:free';

/**
 * Ask AI (TV overlay) default: short answers, latency-critical, good
 * Chinese. ~$0.30/M in, $2.50/M out → about $0.001 per question.
 * Verified on GET https://openrouter.ai/api/v1/models, 2026-10-02.
 */
export const ASK_AI_MODEL = 'google/gemini-2.5-flash';

/**
 * Pack generation (New study) model: long, quality-critical output.
 * $3/M in, $15/M out → about $0.06 per pack. Verified 2026-10-02.
 */
export const PACK_GENERATION_MODEL = 'anthropic/claude-sonnet-4.5';

/**
 * Models the Ask-AI overlay falls back to, in order, when the primary
 * returns no content (reasoning-only / error). The first that differs from
 * the model that just failed is tried once; the free router is last resort.
 * All verified on GET /models 2026-10-02.
 */
export const ASK_AI_FALLBACK_MODELS: readonly string[] = [
  'google/gemini-2.5-flash-lite',
  'deepseek/deepseek-chat-v3-0324',
  FREE_ROUTER_MODEL,
];

/** Where a visitor creates an OpenRouter key. Opened in a new tab; never carries the key. */
export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/keys';

/** The id actually sent to OpenRouter for a stored model choice (the app-side router alias → wire id). */
export function wireModelId(modelId: string): string {
  return modelId === FREE_MODELS_ROUTER_ID ? FREE_ROUTER_MODEL : modelId;
}

export const DEFAULT_AI_SETUP = {
  provider: 'openrouter',
  model: ASK_AI_MODEL,
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

// ---- Configurable model roles (#/setup "模型 Models" rows) · 可配置模型 ----------
// The three constants above are DEFAULTS; the browser's stored choice wins
// when present and valid. Every caller reads through these readers (R3).

/** Stored value when non-empty after trimming, else null. */
function storedText(key: string): string | null {
  const trimmed = (localStorage.getItem(key) ?? '').trim();
  return trimmed || null;
}

/**
 * Store a trimmed choice; an empty value clears the key so the default
 * applies again. Either way the leader-settings sync is told (a signed-in
 * leader's change reaches their other devices; signed out it is a no-op).
 */
function writeChoice(key: string, value: string): void {
  const trimmed = value.trim();
  if (trimmed) localStorage.setItem(key, trimmed);
  else localStorage.removeItem(key);
  noteLeaderSettingChanged(key);
}

/**
 * Ask AI model (app-side id; callers on the wire apply wireModelId): the
 * model chosen in AI settings when the stored provider is OpenRouter (same
 * keys AIProviderSettings uses), otherwise the constant. A visitor who only
 * pasted a key therefore gets the recommended model (one paste, it works).
 */
export function askAIModel(): string {
  const provider = localStorage.getItem(STORAGE_KEYS.AI_PROVIDER);
  const stored = storedText(STORAGE_KEYS.AI_MODEL);
  return provider === DEFAULT_AI_SETUP.provider && stored ? stored : ASK_AI_MODEL;
}

/** Writes provider + model so the choice is effective for Ask AI; "" clears back to the default. */
export function setAskAIModel(modelId: string): void {
  localStorage.setItem(STORAGE_KEYS.AI_PROVIDER, DEFAULT_AI_SETUP.provider);
  writeChoice(STORAGE_KEYS.AI_MODEL, modelId);
}

/**
 * The one deliberate overwrite: the Ask-AI row's "推荐 Recommended" tap in
 * the saved-key dialog state writes provider + recommended model over
 * whatever was stored (e.g. an older free-router choice). Ask AI only; the
 * pack and fallback rows have their own reset.
 */
export function applyRecommendedModel(): void {
  setAskAIModel(ASK_AI_MODEL);
}

export function packGenerationModel(): string {
  return storedText(STORAGE_KEYS.AI_PACK_MODEL) ?? PACK_GENERATION_MODEL;
}

export function setPackGenerationModel(modelId: string): void {
  writeChoice(STORAGE_KEYS.AI_PACK_MODEL, modelId);
}

/** "a, b,,c " → ["a", "b", "c"]: the fallback row's comma-separated text as ids. */
export function parseModelList(raw: string): string[] {
  return raw.split(',').map(id => id.trim()).filter(Boolean);
}

/** Stored comma-separated fallback ids when at least one is non-empty, else the constant list. */
export function askAIFallbackModels(): readonly string[] {
  const parsed = parseModelList(storedText(STORAGE_KEYS.AI_FALLBACK_MODELS) ?? '');
  return parsed.length ? parsed : ASK_AI_FALLBACK_MODELS;
}

/** Stores the ids normalised ("a, b"); a list with no ids clears back to the default. */
export function setAskAIFallbackModels(raw: string): void {
  writeChoice(STORAGE_KEYS.AI_FALLBACK_MODELS, parseModelList(raw).join(', '));
}

/**
 * The model the settings panel should show as selected on open: the stored
 * choice if any, the default for a user who has chosen nothing, and
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
