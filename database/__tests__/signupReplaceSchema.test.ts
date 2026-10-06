/**
 * signupReplaceSchema.test.ts — the replace migration says what the code assumes · 重复报名迁移测试
 *
 * Grep-level pins on database/signup-replace-schema.sql: the replaced_at
 * column, and mark_replaced_signups — SECURITY DEFINER, callable by the
 * service role only (the signup edge function, ADR-0013),
 * only for a fresh live row, marking OTHER live rows of the same pack +
 * lower(trim(email)) created no later than it, returning a count (never an
 * id: a signup id is a member's check-in token).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SIGNUPS_TABLE } from '../../components/signup/signupSchema';
import { MARK_REPLACED_FN, REPLACED_COLUMN } from '../../supabase/functions/send-checkins/replaced';
import { WELCOME_WINDOW_MS } from '../../supabase/functions/send-checkins/recipients';

const sql = readFileSync(path.resolve(__dirname, '../signup-replace-schema.sql'), 'utf-8');
const flat = sql.replace(/\s+/g, ' ');
const fn = (() => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${MARK_REPLACED_FN}(`);
  return sql.slice(start, sql.indexOf('$$;', start) + 3).replace(/\s+/g, ' ');
})();

describe('signup-replace-schema.sql', () => {
  it('adds replaced_at idempotently (old rows stay; nothing is deleted)', () => {
    expect(sql).toContain(`ALTER TABLE ${SIGNUPS_TABLE} ADD COLUMN IF NOT EXISTS ${REPLACED_COLUMN} TIMESTAMPTZ;`);
    expect(sql).not.toMatch(/\bDELETE\b/);
    expect(flat).toContain(`CREATE INDEX IF NOT EXISTS idx_study_signups_pack_email ON ${SIGNUPS_TABLE}(pack_id, lower(trim(email)))`);
  });

  it('mark_replaced_signups: SECURITY DEFINER with a fixed search_path, returns a count, never a row', () => {
    expect(fn).toContain(`(p_new_id UUID) RETURNS INTEGER`);
    expect(fn).toContain('SECURITY DEFINER SET search_path = public');
    expect(fn).not.toMatch(/RETURNS (TABLE|SETOF|UUID|study_signups)/);
    expect(fn).not.toMatch(/RETURNING/);
    expect(fn).toContain('GET DIAGNOSTICS v_count = ROW_COUNT; RETURN v_count;');
  });

  it('only a live row created within the welcome window may replace; it marks other live rows of the same pack + lower(trim(email)), not newer ones', () => {
    expect(fn).toContain('WHERE s.id = p_new_id AND s.replaced_at IS NULL');
    expect(fn).toContain(`v_created < now() - interval '${WELCOME_WINDOW_MS / 60000} minutes'`);
    expect(fn).toContain("IF v_email IS NULL OR v_email = '' THEN RETURN 0;");
    expect(fn).toContain(`UPDATE ${SIGNUPS_TABLE} SET ${REPLACED_COLUMN} = now()`);
    for (const clause of [
      'WHERE pack_id = v_pack', 'AND lower(trim(email)) = v_email', 'AND id <> p_new_id', `AND ${REPLACED_COLUMN} IS NULL`, 'AND created_at <= v_created',
    ]) expect(fn).toContain(clause);
  });

  it('grants: revoked from PUBLIC, anon and authenticated; executable by service_role only', () => {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${MARK_REPLACED_FN}(UUID) FROM PUBLIC, anon, authenticated;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${MARK_REPLACED_FN}(UUID) TO service_role;`);
    expect(sql).not.toMatch(/TO anon/);
  });
});
