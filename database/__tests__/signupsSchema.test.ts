/**
 * signupsSchema.test.ts — the migration says what the code assumes · 迁移文本测试
 *
 * Grep-level pins on database/signups-schema.sql: ownership columns, the
 * RLS policies (anon INSERT only with a leader, reads scoped to
 * auth.uid() = leader_id, pack_summaries writable only by its owner), the
 * table names the browser and the edge function use, and the cron body.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SIGNUPS_TABLE } from '../../components/signup/signupSchema';
import { PACK_SUMMARIES_TABLE } from '../../components/signup/packSummary';
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
    for (const table of [SIGNUPS_TABLE, PACK_SUMMARIES_TABLE, 'checkin_sends']) {
      const body = sql.slice(sql.indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`));
      expect(body.slice(0, body.indexOf(');'))).toMatch(/leader_id UUID NOT NULL REFERENCES auth\.users\(id\)/);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it('study_signups: anon may only INSERT with a leader; reads and deletes are scoped to auth.uid() = leader_id; no UPDATE', () => {
    expect(policy('Anyone may sign up for an owned pack')).toBe(
      `ON ${SIGNUPS_TABLE} FOR INSERT TO anon, authenticated WITH CHECK (leader_id IS NOT NULL)`);
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

  it('checkin_sends: owner-scoped SELECT, no app-role INSERT; the cron body marks itself scheduled', () => {
    expect(policy('Leaders can view their own send log')).toBe(
      'ON checkin_sends FOR SELECT TO authenticated USING (auth.uid() = leader_id)');
    expect(sql).not.toMatch(/ON checkin_sends FOR INSERT/);
    expect(sql).toContain("'scheduled', true");
  });
});
