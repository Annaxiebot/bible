/**
 * signupSchema.ts — the study_signups contract shared by browser and tests · 报名表结构
 *
 * Pure module (no Supabase import) so Playwright specs can import the table
 * name and the row shape. Must match database/signups-schema.sql and
 * database/signup-practices-schema.sql.
 */

import type { ChosenPractice } from '../../supabase/functions/send-checkins/practices';

export const SIGNUPS_TABLE = 'study_signups';
export const SIGNUP_LOCALE = 'zh';

export interface SignupInsert {
  id: string;          // made in the browser (newSignupId): the insert cannot read it back (anon has no SELECT)
  pack_id: string;
  leader_id: string;   // the pack's owning leader (StudyPack.leaderId); RLS scopes reads to this uid
  pack_title: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_checkins: boolean;
  locale: string;
  // The commitment (ADR-0004 §7): every chosen life-menu practice in tap order, an optional own version.
  // practice_* / practice2_* repeat the first two for older readers (supabase/functions/send-checkins/practices.ts).
  practices: ChosenPractice[];
  practice_area: string | null;
  practice_text: string | null;
  practice2_area: string | null;
  practice2_text: string | null;
  practice_note: string | null;
}

/** The edge function both the leader's test and the member's welcome call. */
export const SEND_CHECKINS_FUNCTION = 'send-checkins';

/** checkin_answers: a member's shared answer, written through the SECURITY DEFINER function below. */
export const CHECKIN_ANSWERS_TABLE = 'checkin_answers';
/** RPC the member page calls: share_checkin_answer(p_signup_id, p_kind, p_answer) → uuid. */
export const SHARE_ANSWER_FN = 'share_checkin_answer';
/** RPC the member page reads its context with: checkin_context(p_signup_id) → one row (no contact details). */
export const CHECKIN_CONTEXT_FN = 'checkin_context';
/** RPC a signed-out member's phone reads a leader pack's sign-up slice with: public_signup_pack(p_pack_id) → jsonb | null (database/signup-pack-schema.sql). */
export const SIGNUP_PACK_FN = 'public_signup_pack';
/** Exactly the keys public_signup_pack returns (the privacy boundary, ADR-0006). */
export const SIGNUP_PACK_KEYS = ['id', 'title', 'passageRef', 'leaderId', 'lifeMenu', 'feedbackFormUrl', 'feedbackFormEntries'] as const;
