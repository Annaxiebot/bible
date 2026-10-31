/**
 * aiDefaults.ts — the models the app names in its AI requests · AI 默认模型
 *
 * Single source (R3) for the model ids the browser puts in a request body:
 * Ask AI, pack generation and the Ask-AI fallback chain (ADR-0003
 * Consequences → Models). Imported by services/studyAI, components/studypack
 * (Ask AI) and components/newstudy (pack generation), so they can never
 * disagree; the ai-proxy keeps pinned copies and decides the model that is
 * actually used (per-role allowlist, ADR-0007). Pure module (no React) so
 * tests and Playwright specs can import it.
 *
 * TODO(R8, own session): since the own-key path and its "模型 Models" rows
 * were removed (ADR-0007, 2026-10-23) nothing in the app writes a model
 * choice any more. The readers below still honour a stored or synced one
 * (bounded by the proxy's allowlist); remove the readers' storage lookups,
 * the model keys in leaderSettingsKeys and their leader_settings columns
 * together, with no behaviour change for anyone on the defaults.
 */
import { STORAGE_KEYS } from '../constants/storageKeys';
import { FREE_ROUTER_MODEL } from './openrouter';

/**
 * OpenRouter model id that routes to the best available free model — an
 * older stored choice. wireModelId maps it to OpenRouter's free router
 * (services/openrouter FREE_ROUTER_MODEL); the server proxy knows it too.
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

/** The id actually sent for a stored model choice (the app-side router alias → wire id). */
export function wireModelId(modelId: string): string {
  return modelId === FREE_MODELS_ROUTER_ID ? FREE_ROUTER_MODEL : modelId;
}

export const DEFAULT_AI_SETUP = {
  provider: 'openrouter',
  model: ASK_AI_MODEL,
} as const;

// ---- Model readers · 模型读取 -----------------------------------------------
// The three constants above are DEFAULTS; a stored choice (see the TODO above)
// wins when present and valid. Every caller reads through these readers (R3).

/** Stored value when non-empty after trimming, else null. */
function storedText(key: string): string | null {
  const trimmed = (localStorage.getItem(key) ?? '').trim();
  return trimmed || null;
}

/**
 * Ask AI model (app-side id; callers on the wire apply wireModelId): a
 * stored choice when the stored provider is OpenRouter, otherwise the
 * constant.
 */
export function askAIModel(): string {
  const provider = localStorage.getItem(STORAGE_KEYS.AI_PROVIDER);
  const stored = storedText(STORAGE_KEYS.AI_MODEL);
  return provider === DEFAULT_AI_SETUP.provider && stored ? stored : ASK_AI_MODEL;
}

export function packGenerationModel(): string {
  return storedText(STORAGE_KEYS.AI_PACK_MODEL) ?? PACK_GENERATION_MODEL;
}

/** "a, b,,c " → ["a", "b", "c"]: a stored comma-separated fallback list as ids. */
export function parseModelList(raw: string): string[] {
  return raw.split(',').map(id => id.trim()).filter(Boolean);
}

/** Stored comma-separated fallback ids when at least one is non-empty, else the constant list. */
export function askAIFallbackModels(): readonly string[] {
  const parsed = parseModelList(storedText(STORAGE_KEYS.AI_FALLBACK_MODELS) ?? '');
  return parsed.length ? parsed : ASK_AI_FALLBACK_MODELS;
}
