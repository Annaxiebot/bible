/**
 * policy.ts — what the hosted AI proxy will send upstream · 本站AI策略
 *
 * Pure (no Deno, no fetch), tested under vitest. The server — never the
 * caller — decides the model (per-role default + allowlist), the token cap,
 * the monthly limit and the system message (../_shared/aiPrompts.ts,
 * ADR-0014). Nothing here imports the app bundle: the model ids
 * and PACK_MAX_TOKENS are copies, pinned equal to services/aiDefaults.ts and
 * components/newstudy/packPrompt.ts by __tests__/aiProxy.test.ts.
 */
import { AI_ROLES, AIRole, CONTENT_LANGUAGES, ContentLanguage, buildFinalMessages, isContentLanguage } from '../_shared/aiPrompts.ts';

/** Pure enough for the browser too: services/aiTransport + components/setup/aiUsage import from here (one list, R3). */
export { AI_ROLES };
export type { AIRole };

/** = services/aiDefaults ASK_AI_MODEL (pinned). */
export const ASK_AI_MODEL = 'google/gemini-2.5-flash';
/** = services/aiDefaults PACK_GENERATION_MODEL (pinned). */
export const PACK_GENERATION_MODEL = 'anthropic/claude-sonnet-4.5';
/** = services/aiDefaults ASK_AI_FALLBACK_MODELS (pinned, same order). */
export const ASK_AI_FALLBACK_MODELS: readonly string[] = [
  'google/gemini-2.5-flash-lite',
  'deepseek/deepseek-chat-v3-0324',
  'openrouter/free',
];

/** 'study' = the personal app (#app chat, journal, vibe): the Ask-AI model and allowlist (one list, R3). */
export const ROLE_DEFAULT_MODEL: Readonly<Record<AIRole, string>> = {
  ask: ASK_AI_MODEL,
  pack: PACK_GENERATION_MODEL,
  adjust: PACK_GENERATION_MODEL,
  sharing: PACK_GENERATION_MODEL,
  study: ASK_AI_MODEL,
  pick: ASK_AI_MODEL,
};

/** The Ask-AI model + its client fallback chain — allowed for 'ask', 'study' and 'pick' (Ask AI's first call, ADR-0016). */
const ASK_ALLOWED_MODELS: readonly string[] = [ASK_AI_MODEL, ...ASK_AI_FALLBACK_MODELS];

/** Per role: the only models a caller may request (the client's fallback chain stays honoured for Ask AI). */
export const ROLE_ALLOWED_MODELS: Readonly<Record<AIRole, readonly string[]>> = {
  ask: ASK_ALLOWED_MODELS,
  pack: [PACK_GENERATION_MODEL],
  adjust: [PACK_GENERATION_MODEL],
  sharing: [PACK_GENERATION_MODEL],
  study: ASK_ALLOWED_MODELS,
  pick: ASK_ALLOWED_MODELS,
};

/**
 * pack = components/newstudy/packPrompt PACK_MAX_TOKENS (pinned). study is
 * twice ask: a personal-study answer is long-form and bilingual (中文 [SPLIT]
 * English, services/systemPrompts), so the same content is written twice.
 * pick replies with at most 6 short reference codes (ADR-0016); the cap
 * leaves room for a model that echoes each line's bilingual label too.
 */
export const ROLE_MAX_TOKENS: Readonly<Record<AIRole, number>> = {
  ask: 2000,
  pack: 12000,
  adjust: 4000,
  sharing: 3000,
  study: 4000,
  pick: 160,
};

/** database/ai-usage-schema.sql names (pinned by database/__tests__/aiUsageSchema.test.ts). */
export const AI_USAGE_TABLE = 'ai_usage';
export const QUOTA_FUNCTION = 'consume_ai_quota';

export const MAX_MESSAGES = 40;
export const MAX_TOTAL_CHARS = 60_000;
const MAX_TEMPERATURE = 2;
const MESSAGE_ROLES = new Set(['system', 'user', 'assistant']);

/** Monthly per-leader limits when the secret is unset or not a non-negative integer. */
export const DEFAULT_MONTHLY_LIMITS: Readonly<Record<AIRole, number>> = {
  ask: 300,
  pack: 10,
  adjust: 100,
  sharing: 10,
  study: 100,
  pick: 600,
};

/** The secret that overrides each role's monthly limit. */
export const MONTHLY_LIMIT_SECRET: Readonly<Record<AIRole, string>> = {
  ask: 'AI_MONTHLY_ASK',
  pack: 'AI_MONTHLY_PACK',
  adjust: 'AI_MONTHLY_ADJUST',
  sharing: 'AI_MONTHLY_SHARING',
  study: 'AI_MONTHLY_STUDY',
  pick: 'AI_MONTHLY_PICK',
};

export interface ChatMessage { role: string; content: string }

/** OpenRouter's reasoning switch — the Ask-AI retry turns reasoning off. Only booleans pass. */
export interface ReasoningSwitch { enabled?: boolean; exclude?: boolean }

export interface ProxyRequest {
  role: AIRole;
  /** The final conversation: the server's system message first (aiPrompts.buildFinalMessages). */
  messages: ChatMessage[];
  stream: boolean;
  maxTokens: number;
  model: string;
  temperature?: number;
  reasoning?: ReasoningSwitch;
}

export type Validation =
  | { ok: true; request: ProxyRequest }
  | { ok: false; error: 'invalid-request'; detail: string };

export function isAIRole(value: unknown): value is AIRole {
  return typeof value === 'string' && (AI_ROLES as readonly string[]).includes(value);
}

/** The requested model when the role allows it, else the role's default. */
export function chooseModel(role: AIRole, requested: unknown): string {
  return typeof requested === 'string' && ROLE_ALLOWED_MODELS[role].includes(requested)
    ? requested
    : ROLE_DEFAULT_MODEL[role];
}

/** A positive integer request is capped at the role's limit; anything else gets the cap. */
export function clampMaxTokens(role: AIRole, requested: unknown): number {
  const cap = ROLE_MAX_TOKENS[role];
  if (typeof requested !== 'number' || !Number.isFinite(requested) || requested < 1) return cap;
  return Math.min(Math.floor(requested), cap);
}

function invalid(detail: string): Validation {
  return { ok: false, error: 'invalid-request', detail };
}

/** Reason the messages are unacceptable, or null when they are fine. */
export function messagesProblem(messages: unknown): string | null {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages must be a non-empty array';
  if (messages.length > MAX_MESSAGES) return `at most ${MAX_MESSAGES} messages`;
  let total = 0;
  for (const m of messages as Array<Partial<ChatMessage> | null>) {
    if (!m || typeof m.role !== 'string' || !MESSAGE_ROLES.has(m.role)) return 'each message needs role system|user|assistant';
    if (typeof m.content !== 'string') return 'each message content must be a string';
    total += m.content.length;
  }
  if (total > MAX_TOTAL_CHARS) return `messages exceed ${MAX_TOTAL_CHARS} characters`;
  return (messages as ChatMessage[]).some(m => m.role !== 'system') ? null : 'at least one user or assistant message';
}

/** Ask AI's pack mode (optional: a pre-ADR-0014 bundle omits it); present but unknown → a typed 400. */
function contentLanguage(value: unknown): { ok: true; mode?: ContentLanguage } | { ok: false } {
  if (value === undefined) return { ok: true };
  return isContentLanguage(value) ? { ok: true, mode: value } : { ok: false };
}

function reasoningSwitch(value: unknown): ReasoningSwitch | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { enabled, exclude } = value as Record<string, unknown>;
  const out: ReasoningSwitch = {};
  if (typeof enabled === 'boolean') out.enabled = enabled;
  if (typeof exclude === 'boolean') out.exclude = exclude;
  return Object.keys(out).length ? out : undefined;
}

/** Parse an untrusted body into the request the proxy will forward (model and cap decided here). */
export function validateRequest(body: unknown): Validation {
  if (typeof body !== 'object' || body === null) return invalid('body must be a JSON object');
  const b = body as Record<string, unknown>;
  if (!isAIRole(b.role)) return invalid(`role must be one of ${AI_ROLES.join('|')}`);
  const problem = messagesProblem(b.messages);
  if (problem) return invalid(problem);
  const language = contentLanguage(b.content_language);
  if (!language.ok) return invalid(`content_language must be one of ${CONTENT_LANGUAGES.join('|')}`);
  const temperature = typeof b.temperature === 'number' && b.temperature >= 0 && b.temperature <= MAX_TEMPERATURE
    ? b.temperature : undefined;
  return {
    ok: true,
    request: {
      role: b.role,
      messages: buildFinalMessages(b.role, b.messages as ChatMessage[], language.mode),
      stream: b.stream === true,
      maxTokens: clampMaxTokens(b.role, b.max_tokens),
      model: chooseModel(b.role, b.model),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(reasoningSwitch(b.reasoning) ? { reasoning: reasoningSwitch(b.reasoning) } : {}),
    },
  };
}

/** The OpenRouter chat/completions body for a validated request. */
export function upstreamBody(req: ProxyRequest): Record<string, unknown> {
  return {
    model: req.model,
    messages: req.messages,
    stream: req.stream,
    max_tokens: req.maxTokens,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.reasoning ? { reasoning: req.reasoning } : {}),
  };
}

/** The role's monthly limit: its secret when a non-negative integer, else the default. */
export function monthlyLimit(role: AIRole, env: (name: string) => string): number {
  const raw = env(MONTHLY_LIMIT_SECRET[role]).trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  return DEFAULT_MONTHLY_LIMITS[role];
}
