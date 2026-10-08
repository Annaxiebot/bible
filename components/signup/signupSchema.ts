/**
 * signupSchema.ts — the study_signups contract shared by browser and tests · 报名表结构
 *
 * Pure module (no Supabase import) so Playwright specs can import the table
 * and RPC names. Must match database/signups-schema.sql and
 * database/signup-practices-schema.sql. Rows are written by the `signup`
 * edge function only (supabase/functions/_shared/signup.ts holds its body).
 */

import { SIGNUPS_TABLE } from '../../supabase/functions/_shared/signup';

/** One copy (R3) with the signup edge function, the only writer of the table (ADR-0013). */
export { SIGNUPS_TABLE };

/** The edge function the leader's test send calls (the welcome is asked for by the signup function, ADR-0013). */
export const SEND_CHECKINS_FUNCTION = 'send-checkins';

/** pack_summaries: the check-in sender's text source per pack + the leader's pause switch (packSummary, leaderSubscription). */
export const PACK_SUMMARIES_TABLE = 'pack_summaries';

/** checkin_answers: a member's shared answer, written through the SECURITY DEFINER function below. */
export const CHECKIN_ANSWERS_TABLE = 'checkin_answers';
/** RPC the member page calls: share_checkin_answer(p_signup_id, p_kind, p_answer) → uuid. */
export const SHARE_ANSWER_FN = 'share_checkin_answer';
/** RPC the member page reads its context with: checkin_context(p_signup_id) → one row (no contact details). */
export const CHECKIN_CONTEXT_FN = 'checkin_context';
/** RPC a signed-out member's phone reads a leader pack's sign-up slice with: public_signup_pack(p_pack_id) → jsonb | null (database/remove-forms-schema.sql). */
export const SIGNUP_PACK_FN = 'public_signup_pack';
/** Exactly the keys public_signup_pack returns (the privacy boundary, ADR-0006). */
export const SIGNUP_PACK_KEYS = ['id', 'title', 'passageRef', 'leaderId', 'lifeMenu'] as const;
