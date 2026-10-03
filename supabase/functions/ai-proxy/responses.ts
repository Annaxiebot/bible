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
/** Sent to OpenRouter as HTTP-Referer / X-Title (attribution on the OpenRouter dashboard). */
export const SITE_ORIGIN = 'https://scripturetolife.org';
export const SITE_TITLE = 'Scripture to Life';

const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d{1,5})?$/;

export function isAllowedOrigin(origin: string | null): boolean {
  return origin !== null && (origin === SITE_ORIGIN || LOCALHOST_ORIGIN.test(origin));
}

/** CORS headers: the origin is echoed only when allowed (a browser elsewhere gets no ACAO). */
export function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  return isAllowedOrigin(origin) ? { ...base, 'Access-Control-Allow-Origin': origin as string } : base;
}

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
