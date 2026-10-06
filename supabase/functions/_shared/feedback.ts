/**
 * feedback.ts — the feedback page's shared rules · 意见反馈规则 (ADR-0011)
 *
 * Pure leaf module (no Deno, no imports) read by three callers (R3): the
 * app's #/feedback page (route, limits, client-side validation), the
 * `feedback` edge function (the same validation, server-side, before any
 * insert) and the send-checkins email footer (the link). database/
 * feedback-schema.sql repeats the limits as CHECKs; a test pins them equal.
 */

/** Edge function name (supabase/functions/feedback). */
export const FEEDBACK_FUNCTION = 'feedback';
/** The page's hash; context rides after "?" (from, pack) and is never shown. */
export const FEEDBACK_HASH = '#/feedback';
/** Link text everywhere: emails, the landing footer, the member pages' header. */
export const FEEDBACK_LABEL = '意见反馈 · Feedback';

export const FEEDBACK_MAX_CHARS = 2000;
export const FEEDBACK_EMAIL_MAX_CHARS = 200;
/** The hidden field a person never fills; a bot that fills it is refused. */
export const HONEYPOT_FIELD = 'website';
/** At most this many messages per hashed client IP per window. */
export const RATE_LIMIT_COUNT = 5;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** A whole-field email shape check (also used by the sign-up form). */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Where the link was followed from; anything else is dropped, never stored. */
export const FEEDBACK_SOURCES = ['email', 'landing', 'tv', 'member'] as const;
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];
const PACK_ID_SHAPE = /^[A-Za-z0-9._-]{1,80}$/;

export interface FeedbackContext {
  from?: FeedbackSource;
  pack?: string;
}

/** "#/feedback?from=email&pack=<id>" (pack only when given). */
export function feedbackHash(from: FeedbackSource, packId?: string): string {
  const params = new URLSearchParams({ from });
  if (packId) params.set('pack', packId);
  return `${FEEDBACK_HASH}?${params.toString()}`;
}

/** Keep only a known `from` and a pack-id-shaped `pack`; everything else is discarded. */
export function cleanContext(raw: unknown): FeedbackContext {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const context: FeedbackContext = {};
  if (typeof value.from === 'string' && (FEEDBACK_SOURCES as readonly string[]).includes(value.from)) {
    context.from = value.from as FeedbackSource;
  }
  if (typeof value.pack === 'string' && PACK_ID_SHAPE.test(value.pack)) context.pack = value.pack;
  return context;
}

/** "#/feedback" or "#/feedback?…" → its cleaned context; any other hash → null. */
export function getFeedbackContextFromHash(hash: string): FeedbackContext | null {
  if (hash !== FEEDBACK_HASH && !hash.startsWith(`${FEEDBACK_HASH}?`)) return null;
  const query = hash.slice(FEEDBACK_HASH.length + 1);
  return cleanContext(Object.fromEntries(new URLSearchParams(query)));
}

/** Why a message was refused; the function returns the code as `error` with a 400. */
export const FEEDBACK_PROBLEMS = ['honeypot', 'message-empty', 'message-long', 'email-long', 'email-shape'] as const;
export type FeedbackProblem = (typeof FEEDBACK_PROBLEMS)[number];

export interface FeedbackRecord {
  message: string;
  email: string | null;
  context: FeedbackContext;
}

export type FeedbackVerdict = { ok: true; value: FeedbackRecord } | { ok: false; problem: FeedbackProblem };

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** The one validation (page and function): honeypot empty, message 1..2000, email ≤ 200 and email-shaped when given. */
export function validateFeedback(body: unknown): FeedbackVerdict {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (text(raw[HONEYPOT_FIELD]) !== '') return { ok: false, problem: 'honeypot' };
  const message = text(raw.message);
  if (message.length === 0) return { ok: false, problem: 'message-empty' };
  if (message.length > FEEDBACK_MAX_CHARS) return { ok: false, problem: 'message-long' };
  const email = text(raw.email);
  if (email.length > FEEDBACK_EMAIL_MAX_CHARS) return { ok: false, problem: 'email-long' };
  if (email && !EMAIL_SHAPE.test(email)) return { ok: false, problem: 'email-shape' };
  return { ok: true, value: { message, email: email || null, context: cleanContext(raw.context) } };
}

/** True when this client already sent the maximum in the window. */
export function isRateLimited(recentCount: number): boolean {
  return recentCount >= RATE_LIMIT_COUNT;
}
