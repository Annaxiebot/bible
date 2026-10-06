/**
 * feedbackClient.ts — one call to the `feedback` edge function · 反馈发送 (ADR-0011)
 *
 * The page validates with the same rules first (validateFeedback); the
 * function validates again before any write. The answer is a typed result,
 * never a throw: 400 carries the problem code, 429 the rate limit, anything
 * else non-2xx is 'server', no response at all is 'network'.
 */
import { FunctionsFetchError, FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';
import { FEEDBACK_FUNCTION, FEEDBACK_PROBLEMS, HONEYPOT_FIELD, FeedbackContext } from '../../supabase/functions/_shared/feedback';
import type { FeedbackFailure } from './feedbackStrings';

export interface FeedbackPayload {
  message: string;
  email: string;
  [HONEYPOT_FIELD]: string;   // the honeypot, sent as typed (a person leaves it empty)
  context: FeedbackContext;
}

export type FeedbackResult = { ok: true; id: string } | { ok: false; failure: FeedbackFailure };

const HTTP_TOO_MANY = 429;
const HTTP_BAD_REQUEST = 400;

/** Map a non-2xx reply to its typed failure (the body's `error` is the problem code on a 400). */
async function httpFailure(response: Response | undefined): Promise<FeedbackFailure> {
  if (!response) return 'server';
  if (response.status === HTTP_TOO_MANY) return 'rate-limited';
  if (response.status !== HTTP_BAD_REQUEST) return 'server';
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return FEEDBACK_PROBLEMS.find(p => p === body?.error) ?? 'server';
}

export async function sendFeedback(client: SupabaseClient, payload: FeedbackPayload): Promise<FeedbackResult> {
  const { data, error } = await client.functions.invoke<{ id?: unknown }>(FEEDBACK_FUNCTION, { body: payload });
  if (error instanceof FunctionsHttpError) return { ok: false, failure: await httpFailure(error.context as Response | undefined) };
  if (error instanceof FunctionsFetchError) return { ok: false, failure: 'network' };
  if (error || typeof data?.id !== 'string') return { ok: false, failure: 'server' };
  return { ok: true, id: data.id };
}
