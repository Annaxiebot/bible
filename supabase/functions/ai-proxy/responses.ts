/**
 * responses.ts — the proxy's HTTP decisions · 本站AI响应
 *
 * Pure (no Deno), tested under vitest: CORS origin check, the pre-auth gate
 * (kill switch, missing key), the quota result, the upstream-failure mapping
 * and the log line. Every typed failure the browser maps to a bilingual line
 * is a JSON body whose `error` is a STRING (OpenRouter's own errors, passed
 * through, carry an `error` OBJECT) — components/studypack/askAIErrors.ts
 * hostedErrorFromStatus relies on that difference.
 */
import { AIRole } from './policy.ts';

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** CORS lives in ../_shared/cors.ts (one policy for every function); SITE_ORIGIN is also OpenRouter's HTTP-Referer. */
export { SITE_ORIGIN, isAllowedOrigin, corsHeaders } from '../_shared/cors.ts';
export const SITE_TITLE = 'Scripture to Life';

export interface Failure { status: number; body: Record<string, unknown> }

/**
 * Before any caller work: AI_PROXY_ENABLED='0' → 503 disabled (the kill
 * switch; anything else, including unset, is on); no OPENROUTER_API_KEY →
 * 503 not-configured. Null = proceed.
 */
export function preAuthGate(env: (name: string) => string): Failure | null {
  if (env('AI_PROXY_ENABLED').trim() === '0') return { status: 503, body: { error: 'disabled' } };
  if (!env('OPENROUTER_API_KEY').trim()) return { status: 503, body: { error: 'not-configured' } };
  return null;
}

/** consume_ai_quota returns the new count, or -1 when this month's limit is reached. */
export function quotaFailure(result: number, role: AIRole, limit: number): Failure | null {
  return result < 0 ? { status: 429, body: { error: 'quota', role, limit } } : null;
}

/**
 * A non-OK OpenRouter reply. 402 (the site's credit is spent) → 402
 * no-credit; 401/403 (the server key is wrong or revoked) → 503
 * upstream-auth, never "your key is invalid" — the caller has no key.
 * Anything else passes through with OpenRouter's own error JSON.
 */
export function upstreamFailure(status: number, upstreamJson: unknown): Failure {
  if (status === 402) return { status: 402, body: { error: 'no-credit' } };
  if (status === 401 || status === 403) return { status: 503, body: { error: 'upstream-auth' } };
  const body = typeof upstreamJson === 'object' && upstreamJson !== null
    ? upstreamJson as Record<string, unknown>
    : { error: { message: `OpenRouter HTTP ${status}`, code: status } };
  return { status, body };
}

const UID_PREFIX_CHARS = 8;

/** The only thing ever logged: role, uid prefix, status — never message content. */
export function logLine(role: string, uid: string | null, status: number): string {
  return `[ai-proxy] role=${role} uid=${uid ? uid.slice(0, UID_PREFIX_CHARS) : '-'} status=${status}`;
}
