/**
 * checkinOptoutSchema.test.ts — the opt-out migration says what the code assumes · 退订迁移测试
 *
 * Grep-level pins on database/checkin-optout-schema.sql (ADR-0009): the
 * columns, the member RPCs (token = authority, anon-callable, idempotent,
 * boolean found), the leader RPC (owner only, authenticated only, may not
 * resume a member's own stop — SQLSTATE STL01), checkin_context's single
 * definition returning unsubscribed_at and never contact details. The live
 * project was probed with a rolled-back transaction (see the ADR).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { SIGNUPS_TABLE, CHECKIN_CONTEXT_FN } from '../../components/signup/signupSchema';
import {
  UNSUBSCRIBED_COLUMN, UNSUBSCRIBED_BY_COLUMN, UNSUBSCRIBE_FN, RESUBSCRIBE_FN, LEADER_SUBSCRIPTION_FN, MEMBER_CHOICE_ERRCODE, PAUSED_COLUMN,
} from '../../supabase/functions/send-checkins/optout';

const dir = path.resolve(__dirname, '..');
const sql = readFileSync(path.join(dir, 'checkin-optout-schema.sql'), 'utf-8');

/** One function's text from CREATE to its closing $$, whitespace-collapsed. */
function fnBody(name: string): string {
  const start = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${name}\\(`));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf('$$;', sql.indexOf('$$', sql.indexOf('AS $$', start) + 5)) + 3;
  return sql.slice(start, end).replace(/\s+/g, ' ');
}

describe('checkin-optout-schema.sql', () => {
  it('adds the columns idempotently; unsubscribed_by is member|leader; pause defaults to off', () => {
    expect(sql).toContain(`ALTER TABLE ${SIGNUPS_TABLE} ADD COLUMN IF NOT EXISTS ${UNSUBSCRIBED_COLUMN} TIMESTAMPTZ;`);
    expect(sql).toContain(`ALTER TABLE ${SIGNUPS_TABLE} ADD COLUMN IF NOT EXISTS ${UNSUBSCRIBED_BY_COLUMN} TEXT;`);
    expect(sql.replace(/\s+/g, ' ')).toContain(`CHECK (${UNSUBSCRIBED_BY_COLUMN} IS NULL OR ${UNSUBSCRIBED_BY_COLUMN} IN ('member', 'leader'))`);
    expect(sql).toContain(`ALTER TABLE pack_summaries ADD COLUMN IF NOT EXISTS ${PAUSED_COLUMN} BOOLEAN NOT NULL DEFAULT false;`);
    expect(sql).not.toMatch(/\bDELETE\b/);
  });

  it('member stop/resume: SECURITY DEFINER, fixed search_path, boolean found, same person (pack + email) only', () => {
    for (const name of [UNSUBSCRIBE_FN, RESUBSCRIBE_FN]) {
      const fn = fnBody(name);
      expect(fn).toContain('(p_id UUID) RETURNS BOOLEAN');
      expect(fn).toContain('SECURITY DEFINER SET search_path = public');
      expect(fn).toContain('IF NOT FOUND THEN RETURN false;');
      expect(fn).toContain("WHERE id = p_id OR (v_email <> '' AND pack_id = v_pack AND lower(trim(email)) = v_email)");
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${name}(UUID) FROM PUBLIC;`);
    }
    expect(fnBody(UNSUBSCRIBE_FN)).toContain("SET unsubscribed_at = coalesce(unsubscribed_at, now()), unsubscribed_by = 'member'");
    expect(fnBody(RESUBSCRIBE_FN)).toContain('SET unsubscribed_at = NULL, unsubscribed_by = NULL');
    // The one-click endpoint calls unsubscribe_signup with the service role.
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${UNSUBSCRIBE_FN}(UUID) TO anon, authenticated, service_role;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${RESUBSCRIBE_FN}(UUID) TO anon, authenticated;`);
  });

  it('leader RPC: owner only, authenticated only (anon revoked explicitly), may not resume a member\'s own stop', () => {
    const fn = fnBody(LEADER_SUBSCRIPTION_FN);
    expect(fn).toContain('(p_id UUID, p_stop BOOLEAN) RETURNS BOOLEAN');
    expect(fn).toContain('SECURITY DEFINER SET search_path = public');
    expect(fn).toContain("IF auth.uid() IS NULL OR v_leader <> auth.uid() THEN RAISE EXCEPTION 'not your sign-up' USING ERRCODE = '42501';");
    expect(fn).toContain(`IF v_at IS NOT NULL AND v_by = 'member' THEN RAISE EXCEPTION 'member-unsubscribed' USING ERRCODE = '${MEMBER_CHOICE_ERRCODE}';`);
    expect(fn).toContain("unsubscribed_by = coalesce(unsubscribed_by, 'leader')");   // a leader stop never overwrites the member's own
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${LEADER_SUBSCRIPTION_FN}(UUID, BOOLEAN) FROM PUBLIC, anon;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${LEADER_SUBSCRIPTION_FN}(UUID, BOOLEAN) TO authenticated;`);
  });

  it('checkin_context: dropped and re-created here, returns practices + unsubscribed_at, by token only, never contact details', () => {
    expect(sql).toContain(`DROP FUNCTION IF EXISTS public.${CHECKIN_CONTEXT_FN}(UUID);`);
    const fn = fnBody(CHECKIN_CONTEXT_FN);
    expect(fn).toContain('SECURITY DEFINER');
    expect(fn).toContain('SET search_path = public');
    expect(fn).toContain('WHERE s.id = p_signup_id');
    expect(fn).not.toMatch(/\b(phone|email)\b/);
    for (const col of ['practice_area TEXT', 'practice_text TEXT', 'practice_note TEXT', 'feedback_form_url TEXT', 'practices JSONB', `${UNSUBSCRIBED_COLUMN} TIMESTAMPTZ`]) {
      expect(fn).toContain(col);
    }
    expect(fn).toContain(`s.practices, s.${UNSUBSCRIBED_COLUMN}`);
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${CHECKIN_CONTEXT_FN}(UUID) FROM PUBLIC;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${CHECKIN_CONTEXT_FN}(UUID) TO anon, authenticated;`);
  });

  it('checkin_context has exactly one definition across database/*.sql (R3)', () => {
    const definers = readdirSync(dir).filter(f => f.endsWith('.sql'))
      .filter(f => new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${CHECKIN_CONTEXT_FN}\\(`).test(readFileSync(path.join(dir, f), 'utf-8')));
    expect(definers).toEqual(['checkin-optout-schema.sql']);
  });

  it('the runbook documents the site-wide pause secret and the verify_jwt-off deploy', () => {
    const runbook = readFileSync(path.join(dir, 'signups-schema.sql'), 'utf-8');
    expect(runbook).toContain('supabase secrets set CHECKIN_PAUSED=1');
    expect(runbook).toContain('supabase secrets set CHECKIN_PAUSED=0');
    expect(runbook).toContain('supabase functions deploy send-checkins --no-verify-jwt');
    const config = readFileSync(path.resolve(dir, '../supabase/config.toml'), 'utf-8');
    expect(config).toMatch(/\[functions\.send-checkins\]\s*\nverify_jwt = false/);
  });
});
