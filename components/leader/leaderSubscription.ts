/**
 * leaderSubscription.ts — the leader's stop/resume and pause writes · 组长停发与暂停 (ADR-0009)
 *
 * Stop/resume one member: the SECURITY DEFINER RPC
 * leader_set_signup_subscription (checks auth.uid() = the row's leader_id;
 * study_signups has no UPDATE policy). A member's own stop may not be
 * resumed by the leader: the RPC raises SQLSTATE STL01, surfaced here as
 * MemberChoiceError so the roster can show that state instead of an error.
 * Pause one study: pack_summaries.checkins_paused under the owner's
 * existing UPDATE policy. Every other failure throws a bilingual error.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { PACK_SUMMARIES_TABLE } from '../signup/packSummary';
import {
  LEADER_SUBSCRIPTION_FN, MEMBER_CHOICE_ERRCODE, PAUSED_COLUMN,
} from '../../supabase/functions/send-checkins/optout';
import { LD_BY_MEMBER, LD_ERR_SUBSCRIPTION, LD_ERR_PAUSE } from './leaderStrings';

/** The member stopped their own reminders; a leader may not resume them. */
export class MemberChoiceError extends Error {
  constructor() {
    super(LD_BY_MEMBER);
    this.name = 'MemberChoiceError';
  }
}

/** Stop (true) or resume (false) one sign-up; resolves the row's new state (true = stopped). */
export async function leaderSetSubscription(client: SupabaseClient, signupId: string, stop: boolean): Promise<boolean> {
  const { data, error } = await client.rpc(LEADER_SUBSCRIPTION_FN, { p_id: signupId, p_stop: stop });
  if (error?.code === MEMBER_CHOICE_ERRCODE) throw new MemberChoiceError();
  if (error) throw new Error(`${LD_ERR_SUBSCRIPTION}: ${error.message}`);
  if (typeof data !== 'boolean') throw new Error(`${LD_ERR_SUBSCRIPTION}: ${JSON.stringify(data)}`);
  return data;
}

/** Whether the pack's reminders are paused (no summary row yet → not paused). */
export async function fetchPackPaused(client: SupabaseClient, packId: string): Promise<boolean> {
  const { data, error } = await client.from(PACK_SUMMARIES_TABLE).select(PAUSED_COLUMN).eq('pack_id', packId).maybeSingle();
  if (error) throw new Error(`${LD_ERR_PAUSE}: ${error.message}`);
  return (data as Record<string, unknown> | null)?.[PAUSED_COLUMN] === true;
}

/** Pause or un-pause the pack; throws when no owned summary row was updated (RLS or not synced yet). */
export async function setPackPaused(client: SupabaseClient, packId: string, leaderId: string, paused: boolean): Promise<void> {
  const { data, error } = await client.from(PACK_SUMMARIES_TABLE)
    .update({ [PAUSED_COLUMN]: paused })
    .eq('pack_id', packId)
    .eq('leader_id', leaderId)
    .select('pack_id');
  if (error) throw new Error(`${LD_ERR_PAUSE}: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1) throw new Error(`${LD_ERR_PAUSE}: ${packId}`);
}
