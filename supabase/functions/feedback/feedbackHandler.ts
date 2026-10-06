/**
 * feedbackHandler.ts — the feedback function's whole decision, minus Deno · 反馈处理
 *
 * Pure apart from crypto.subtle (global in Deno and Node), so vitest drives
 * the real order with fakes: method → validation (honeypot, lengths, email
 * shape) → salted IP hash → rate limit → insert → one email. Nothing is
 * written before validation and the rate limit pass. index.ts only wires
 * Deno.env and the service client into FeedbackDeps.
 */
import { validateFeedback, isRateLimited, RATE_LIMIT_WINDOW_MS, FeedbackRecord } from '../_shared/feedback.ts';
import { feedbackEmail, StoredFeedback } from './feedbackEmail.ts';
import type { CheckinMessage } from '../send-checkins/templates.ts';
import { hashClientIp } from '../_shared/clientIp.ts';

export const FEEDBACK_TABLE = 'feedback';

/** The inserted row (the table adds id and created_at). */
export interface FeedbackInsert {
  message: string;
  email: string | null;
  context: FeedbackRecord['context'];
  ip_hash: string;
}

export interface FeedbackDeps {
  salt: string;
  now: () => Date;
  countSince: (ipHash: string, sinceIso: string) => Promise<number>;
  insert: (row: FeedbackInsert) => Promise<{ id: string; created_at: string }>;
  send: (message: CheckinMessage, replyTo: string | null) => Promise<void>;
  logError: (message: string) => void;
}

export interface HandlerReply {
  status: number;
  body: Record<string, unknown>;
}

export async function handleFeedback(method: string, body: unknown, ip: string, deps: FeedbackDeps): Promise<HandlerReply> {
  if (method !== 'POST') return { status: 405, body: { error: 'POST only' } };
  const verdict = validateFeedback(body);
  if (verdict.ok === false) return { status: 400, body: { error: verdict.problem } };
  if (!deps.salt) return { status: 500, body: { error: 'FEEDBACK_SALT is not set' } };
  const ipHash = await hashClientIp(deps.salt, ip);
  const since = new Date(deps.now().getTime() - RATE_LIMIT_WINDOW_MS).toISOString();
  if (isRateLimited(await deps.countSince(ipHash, since))) return { status: 429, body: { error: 'rate-limited' } };
  const record = verdict.value;
  const stored = await deps.insert({ message: record.message, email: record.email, context: record.context, ip_hash: ipHash });
  const row: StoredFeedback = { ...record, id: stored.id, createdAt: stored.created_at };
  try {
    await deps.send(feedbackEmail(row), record.email);
    return { status: 200, body: { id: row.id, emailed: true } };
  } catch (err) {
    // R5: deliberately not surfaced to the writer. Their message is already
    // stored (the owner reads the feedback table in the dashboard), so the
    // honest answer to them is "received"; the failure goes to the function
    // logs and the response says emailed:false for anyone debugging.
    deps.logError(`feedback ${row.id}: email failed: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 200, body: { id: row.id, emailed: false } };
  }
}
