/**
 * signupsSchema.test.ts — the migration says what the code assumes · 迁移文本测试
 *
 * Grep-level pins on database/signups-schema.sql: ownership columns, the
 * RLS policies (no INSERT policy for app roles — the signup edge function
 * writes, ADR-0013 — reads scoped to
 * auth.uid() = leader_id, pack_summaries writable only by its owner), the
 * table names the browser and the edge function use, and the cron body.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SIGNUPS_TABLE } from '../../components/signup/signupSchema';
import { PACK_SUMMARIES_TABLE } from '../../components/signup/packSummary';
import { CHECKIN_ANSWERS_TABLE, SHARE_ANSWER_FN, CHECKIN_CONTEXT_FN } from '../../components/signup/signupSchema';
import { PACK_SUMMARIES_TABLE as FN_SUMMARIES_TABLE } from '../../supabase/functions/send-checkins/packSource.ts';

const sql = readFileSync(path.resolve(__dirname, '../signups-schema.sql'), 'utf-8');

/** The statements between "CREATE POLICY <name>" and the next semicolon, whitespace-normalised. */
function policy(name: string): string {
  const match = new RegExp(`CREATE POLICY "${name}"([^;]+);`).exec(sql);
  if (!match) throw new Error(`policy not found: ${name}`);
  return match[1].replace(/\s+/g, ' ').trim();
}

describe('signups-schema.sql', () => {
  it('names the tables the code uses', () => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${SIGNUPS_TABLE} (`);
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${PACK_SUMMARIES_TABLE} (`);
    expect(FN_SUMMARIES_TABLE).toBe(PACK_SUMMARIES_TABLE);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS checkin_sends (');
  });

  it('every table carries a NOT NULL leader_id and RLS is enabled on each', () => {
    for (const table of [SIGNUPS_TABLE, PACK_SUMMARIES_TABLE, 'checkin_sends', CHECKIN_ANSWERS_TABLE]) {
      const body = sql.slice(sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`));
      expect(body.slice(0, body.indexOf(');'))).toMatch(/leader_id UUID NOT NULL REFERENCES auth\.users\(id\)/);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('study_signups: no INSERT policy for app roles (the old anon one is dropped); reads and deletes are scoped to auth.uid() = leader_id; no UPDATE', () => {
    expect(sql).not.toMatch(new RegExp(`ON ${SIGNUPS_TABLE} FOR INSERT`));
    expect(sql).not.toContain('CREATE POLICY "Anyone may sign up for an owned pack"');
    expect(sql).toContain(`DROP POLICY IF EXISTS "Anyone may sign up for an owned pack" ON ${SIGNUPS_TABLE};`);
    expect(sql).toContain('database/signup-endpoint-schema.sql');
    expect(policy('Leaders can view their own sign-ups')).toBe(
      `ON ${SIGNUPS_TABLE} FOR SELECT TO authenticated USING (auth.uid() = leader_id)`);
    expect(policy('Leaders can delete their own sign-ups')).toBe(
      `ON ${SIGNUPS_TABLE} FOR DELETE TO authenticated USING (auth.uid() = leader_id)`);
    expect(sql).not.toMatch(new RegExp(`ON ${SIGNUPS_TABLE} FOR UPDATE`));
    expect(sql).not.toMatch(/USING \(TRUE\)|WITH CHECK \(TRUE\)/);
  });

  it('pack_summaries: select/insert/update only for the owner, nothing for anon', () => {
    expect(policy('Leaders can view their own pack summaries')).toBe(
      `ON ${PACK_SUMMARIES_TABLE} FOR SELECT TO authenticated USING (auth.uid() = leader_id)`);
    expect(policy('Leaders can insert their own pack summaries')).toBe(
      `ON ${PACK_SUMMARIES_TABLE} FOR INSERT TO authenticated WITH CHECK (auth.uid() = leader_id)`);
    expect(policy('Leaders can update their own pack summaries')).toBe(
      `ON ${PACK_SUMMARIES_TABLE} FOR UPDATE TO authenticated USING (auth.uid() = leader_id) WITH CHECK (auth.uid() = leader_id)`);
    expect(sql).not.toMatch(new RegExp(`ON ${PACK_SUMMARIES_TABLE} [^;]*TO anon`));
  });

  it('study_signups carries the commitment columns; the retired Google Forms columns are dropped', () => {
    for (const col of ['practice_area', 'practice_text', 'practice2_area', 'practice2_text', 'practice_note']) {
      expect(sql).toContain(`ALTER TABLE ${SIGNUPS_TABLE} ADD COLUMN IF NOT EXISTS ${col} TEXT;`);
    }
    expect(sql).toContain(`ALTER TABLE ${PACK_SUMMARIES_TABLE} DROP COLUMN IF EXISTS feedback_form_url, DROP COLUMN IF EXISTS feedback_form_entries;`);
    expect(sql).not.toContain('ADD COLUMN IF NOT EXISTS feedback_form');
    expect(sql).toContain("CHECK (kind IN ('tue', 'thu', 'weekend', 'welcome'))");
  });

  it('checkin_answers: leader-scoped SELECT only; writes go through the SECURITY DEFINER function that copies ownership from the signup row', () => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${CHECKIN_ANSWERS_TABLE} (`);
    expect(sql).toContain(`ALTER TABLE ${CHECKIN_ANSWERS_TABLE} ENABLE ROW LEVEL SECURITY;`);
    expect(policy('Leaders can view their own shared answers')).toBe(
      `ON ${CHECKIN_ANSWERS_TABLE} FOR SELECT TO authenticated USING (auth.uid() = leader_id)`);
    expect(sql).not.toMatch(new RegExp(`ON ${CHECKIN_ANSWERS_TABLE} FOR (INSERT|UPDATE|DELETE)`));
    const fn = sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION public.${SHARE_ANSWER_FN}(`));
    const body = fn.slice(0, fn.indexOf('$$;') + 3);
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain('SET search_path = public');
    expect(body).toMatch(/SELECT pack_id, leader_id INTO v_pack_id, v_leader_id FROM study_signups WHERE id = p_signup_id/);
    expect(body).toMatch(/INSERT INTO checkin_answers \(signup_id, pack_id, leader_id, kind, answer\)\s+VALUES \(p_signup_id, v_pack_id, v_leader_id, p_kind, p_answer\)/);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${SHARE_ANSWER_FN}(UUID, TEXT, TEXT) TO anon, authenticated;`);
  });

  it('checkin_context is defined once, in signup-practices-schema.sql (R3), not here', () => {
    expect(sql).not.toContain(`FUNCTION public.${CHECKIN_CONTEXT_FN}(`);
    expect(sql).toContain('database/signup-practices-schema.sql');
  });

  it('checkin_sends: owner-scoped SELECT, no app-role INSERT; the schedule lives in checkin-cron-schema.sql', () => {
    expect(policy('Leaders can view their own send log')).toBe(
      'ON checkin_sends FOR SELECT TO authenticated USING (auth.uid() = leader_id)');
    expect(sql).not.toMatch(/ON checkin_sends FOR INSERT/);
    expect(sql).toContain('database/checkin-cron-schema.sql');
    expect(sql).not.toContain('cron.schedule(');
  });
});
