/**
 * checkinClient.ts — the member's check-in data paths · 跟进数据层
 *
 * Context (practices, prompts) comes from the checkin_context() RPC with the
 * signup uuid as the only credential. "Keep private" writes localStorage
 * on this device and never touches the network; "Share with leader" calls
 * share_checkin_answer() (SECURITY DEFINER copies pack/leader from the
 * signup row, database/signups-schema.sql). Errors carry bilingual labels.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CHECKIN_CONTEXT_FN, SHARE_ANSWER_FN } from '../signup/signupSchema';
import { CK_ERR_LOAD, CK_ERR_SHARE, CK_DEFAULT_QUESTION } from './checkinStrings';
import { CheckinKind, CHECKIN_KINDS } from './checkinRoute';
import type { ChosenPractice } from '../../supabase/functions/send-checkins/practices';
import { promptWithoutKindLabel } from '../../supabase/functions/send-checkins/promptText';

export interface CheckinContext {
  pack_id: string;
  pack_title: string;
  name: string;
  practice_area: string | null;
  practice_text: string | null;
  practice_note: string | null;
  practices?: ChosenPractice[] | null;   // every chosen practice; null on rows from before multi-select
  reflection_lines: string[];
  feedback_form_url: string | null;
}

/** Which reflection line carries each kind's prompt (same as the edge function's REFLECTION_LINE_INDEX). */
const PROMPT_LINE: Record<CheckinKind, number> = { tue: 0, thu: 1, weekend: 2 };

/** The kind's question, without the kind label the line may repeat (the page's heading already names the kind). */
export function promptFor(context: Pick<CheckinContext, 'reflection_lines'>, kind: CheckinKind): string {
  const line = context.reflection_lines[PROMPT_LINE[kind]];
  return line === undefined ? CK_DEFAULT_QUESTION : promptWithoutKindLabel(line);
}

export async function fetchCheckinContext(client: SupabaseClient, signupId: string): Promise<CheckinContext> {
  const { data, error } = await client.rpc(CHECKIN_CONTEXT_FN, { p_signup_id: signupId });
  if (error) throw new Error(`${CK_ERR_LOAD}: ${error.message}`);
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as CheckinContext[];
  if (rows.length === 0) throw new Error(CK_ERR_LOAD);
  return { ...rows[0], reflection_lines: rows[0].reflection_lines ?? [] };
}

export async function shareAnswer(client: SupabaseClient, signupId: string, kind: CheckinKind, answer: string): Promise<void> {
  const { error } = await client.rpc(SHARE_ANSWER_FN, { p_signup_id: signupId, p_kind: kind, p_answer: answer });
  if (error) throw new Error(`${CK_ERR_SHARE}: ${error.message}`);
}

// ---- private answers: this device only ----

export function privateAnswerKey(signupId: string, kind: CheckinKind): string {
  return `checkin:${signupId}:${kind}`;
}

export function readPrivateAnswer(signupId: string, kind: CheckinKind, store: Pick<Storage, 'getItem'> = window.localStorage): string {
  return store.getItem(privateAnswerKey(signupId, kind)) ?? '';
}

export function keepPrivateAnswer(
  signupId: string, kind: CheckinKind, answer: string, store: Pick<Storage, 'setItem'> = window.localStorage,
): void {
  store.setItem(privateAnswerKey(signupId, kind), answer);
}

/** The check-in kind for today in Los Angeles time; Mon/Wed/Fri fall to the weekend question. */
export function kindForToday(now: Date = new Date()): CheckinKind {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(now);
  if (weekday === 'Tue') return 'tue';
  if (weekday === 'Thu') return 'thu';
  return CHECKIN_KINDS[2];
}
