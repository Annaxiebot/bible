/**
 * leaderData.ts — sign-up rows, CSV, and the dry-run test call · 组长数据层
 *
 * Reads run as the signed-in leader (RLS: leader_id = auth.uid()). The test
 * check-in invokes the send-checkins edge function with the leader's JWT;
 * the function forces a dry run for any non-service-role caller and
 * addresses it to `test_to` only, so this button can never message members.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudyPack } from '../studypack/packTypes';
import { SIGNUPS_TABLE } from '../signup/signupSchema';
import { LD_ERR_LOAD, LD_TEST_FAILED } from './leaderStrings';

export interface SignupRecord {
  id: string;
  leader_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_checkins: boolean;
  created_at: string;
}

export const SIGNUP_COLUMNS = 'id, leader_id, name, phone, email, consent_checkins, created_at';
export const SEND_CHECKINS_FUNCTION = 'send-checkins';
/** The kind a leader's test uses, whatever the weekday. */
export const TEST_CHECKIN_KIND = 'tue';

/**
 * The signed-in leader's rows for the pack, newest first. RLS already limits
 * the query to leader_id = auth.uid(); the client filters by the same uid so
 * a misconfigured policy can never widen what the page shows. Throws a
 * bilingual error carrying the PostgREST message.
 */
export async function fetchSignups(client: SupabaseClient, packId: string, leaderId: string): Promise<SignupRecord[]> {
  const { data, error } = await client
    .from(SIGNUPS_TABLE)
    .select(SIGNUP_COLUMNS)
    .eq('pack_id', packId)
    .eq('leader_id', leaderId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`${LD_ERR_LOAD}: ${error.message}`);
  return ((data ?? []) as SignupRecord[]).filter(row => row.leader_id === leaderId);
}

export const CSV_COLUMNS = ['name', 'phone', 'email', 'consent_checkins', 'created_at'] as const;

function csvCell(value: string | boolean | null): string {
  const text = value === null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV with a header row; a UTF-8 BOM so Excel opens Chinese names correctly. */
export function signupsToCsv(rows: SignupRecord[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) lines.push(CSV_COLUMNS.map(col => csvCell(row[col])).join(','));
  return `﻿${lines.join('\n')}\n`;
}

export function csvFilename(packId: string): string {
  return `signups-${packId}.csv`;
}

export interface TestCheckinResult {
  dry_run: boolean;
  attempted: number;
  results?: Array<{ status: string; to: string; error?: string }>;
}

/**
 * Ask the edge function for a dry-run check-in to the leader's own email.
 * The text comes from the pack's pack_summaries row (the page upserts it on
 * open), never from the request. Throws on any failure.
 */
export async function sendTestCheckin(
  client: SupabaseClient, pack: StudyPack, email: string, name: string,
): Promise<TestCheckinResult> {
  const { data, error } = await client.functions.invoke<TestCheckinResult>(SEND_CHECKINS_FUNCTION, {
    body: { pack_id: pack.id, kind: TEST_CHECKIN_KIND, test_to: email, test_name: name },
  });
  if (error) throw new Error(`${LD_TEST_FAILED}: ${error.message}`);
  if (!data || data.attempted !== 1) throw new Error(`${LD_TEST_FAILED}: ${JSON.stringify(data)}`);
  const failed = data.results?.find(r => r.status === 'failed');
  if (failed) throw new Error(`${LD_TEST_FAILED}: ${failed.error ?? failed.status}`);
  return data;
}
