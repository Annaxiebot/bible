/**
 * leaderData.ts — sign-up rows, shared answers, CSV, and the dry-run test call · 组长数据层
 *
 * Reads run as the signed-in leader (RLS: leader_id = auth.uid()). The test
 * check-in invokes the send-checkins edge function with the leader's JWT;
 * the function forces a dry run for any non-service-role caller and
 * addresses it to `test_to` only, so this button can never message members.
 * Commitments (which practice each member chose) and shared feedback
 * (checkin_answers) are the material for next Friday's closing question
 * (ADR-0004 §7).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudyPack } from '../studypack/packTypes';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE, SEND_CHECKINS_FUNCTION } from '../signup/signupSchema';
import type { CheckinKind } from '../checkin/checkinRoute';
import { CHECKIN_KINDS } from '../checkin/checkinRoute';
import { LD_ERR_LOAD, LD_TEST_FAILED } from './leaderStrings';
import { chosenPractices, ChosenPractice } from '../../supabase/functions/send-checkins/practices';

export { SEND_CHECKINS_FUNCTION };

export interface SignupRecord {
  id: string;
  leader_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_checkins: boolean;
  created_at: string;
  practice_area: string | null;
  practice_text: string | null;
  practice2_area: string | null;
  practice2_text: string | null;
  practice_note: string | null;
  practices?: ChosenPractice[] | null;   // every chosen practice; absent/null on rows from before multi-select
}

export interface AnswerRecord {
  id: string;
  signup_id: string;
  leader_id: string;
  kind: CheckinKind;
  answer: string;
  created_at: string;
}

export const SIGNUP_COLUMNS =
  'id, leader_id, name, phone, email, consent_checkins, created_at, practice_area, practice_text, practice2_area, practice2_text, practice_note, practices';
export const ANSWER_COLUMNS = 'id, signup_id, leader_id, kind, answer, created_at';
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

/** Shared answers for the pack, newest first, same ownership guard. */
export async function fetchAnswers(client: SupabaseClient, packId: string, leaderId: string): Promise<AnswerRecord[]> {
  const { data, error } = await client
    .from(CHECKIN_ANSWERS_TABLE)
    .select(ANSWER_COLUMNS)
    .eq('pack_id', packId)
    .eq('leader_id', leaderId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`${LD_ERR_LOAD}: ${error.message}`);
  return ((data ?? []) as AnswerRecord[]).filter(row => row.leader_id === leaderId);
}

/** How many members chose each area (every chosen practice counts; legacy rows: first + second), in first-seen order. */
export function commitmentCounts(rows: SignupRecord[]): Array<{ area: string; count: number }> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const areas = new Set(chosenPractices(row).map(p => p.area).filter(Boolean));
    for (const area of areas) counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts.entries()].map(([area, count]) => ({ area, count }));
}

/** Members who shared at least one answer, by kind (and overall), against the sign-up count. */
export function feedbackCounts(rows: SignupRecord[], answers: AnswerRecord[]): { signedUp: number; answered: number; byKind: Record<CheckinKind, number> } {
  const byKind = { tue: 0, thu: 0, weekend: 0 };
  for (const kind of CHECKIN_KINDS) byKind[kind] = new Set(answers.filter(a => a.kind === kind).map(a => a.signup_id)).size;
  return { signedUp: rows.length, answered: new Set(answers.map(a => a.signup_id)).size, byKind };
}

/** Latest shared answer per signup per kind (answers arrive newest first). */
export function latestAnswers(answers: AnswerRecord[]): Map<string, Partial<Record<CheckinKind, string>>> {
  const latest = new Map<string, Partial<Record<CheckinKind, string>>>();
  for (const a of answers) {
    const entry = latest.get(a.signup_id) ?? {};
    if (!entry[a.kind]) entry[a.kind] = a.answer;
    latest.set(a.signup_id, entry);
  }
  return latest;
}

export const CSV_COLUMNS = [
  'name', 'phone', 'email', 'consent_checkins', 'created_at',
  'practice_area', 'practice_text', 'practice2_area', 'practice2_text', 'practice_note', 'practices',
  'answer_tue', 'answer_thu', 'answer_weekend',
] as const;

function csvCell(value: string | boolean | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Every chosen practice as "area: practice", joined with "; " (one CSV cell). */
function practicesCell(row: SignupRecord): string {
  return chosenPractices(row).map(p => (p.area ? `${p.area}: ${p.practice}` : p.practice)).join('; ');
}

/** RFC 4180 CSV with a header row; a UTF-8 BOM so Excel opens Chinese names correctly. Shared answers ride along. */
export function signupsToCsv(rows: SignupRecord[], answers: AnswerRecord[] = []): string {
  const latest = latestAnswers(answers);
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const shared = latest.get(row.id) ?? {};
    const record: Record<(typeof CSV_COLUMNS)[number], string | boolean | null | undefined> = {
      ...row, practices: practicesCell(row), answer_tue: shared.tue, answer_thu: shared.thu, answer_weekend: shared.weekend,
    };
    lines.push(CSV_COLUMNS.map(col => csvCell(record[col])).join(','));
  }
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
