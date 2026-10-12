/**
 * adminPortalSchema.test.ts — the admin SQL says what the portal assumes · 管理后台迁移测试 (ADR-0023)
 *
 * Grep-level pins on database/admin-portal-schema.sql: site_admins is
 * locked (RLS, no policy, no client privileges); is_site_admin() only asks
 * about auth.uid(); every admin_* function is SECURITY DEFINER with a pinned
 * search_path, calls the guard first, and is executable by authenticated
 * only; the guard raises ADMIN_DENIED_CODE; the returned columns equal the
 * client's; feedback never returns ip_hash; Ask AI counts the quota's UTC
 * month key; the owner insert is separate and idempotent; the privacy page
 * carries the owner line.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  IS_SITE_ADMIN_FN, ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN, ADMIN_DENIED_CODE,
  ADMIN_LEADER_COLUMNS, ADMIN_FEEDBACK_COLUMNS, ADMIN_EXTRA_STATS_KEYS,
} from '../../components/admin/adminRules';
import { SITE_STATS_FN } from '../../components/stats/statsRules';

const sql = readFileSync(path.resolve(__dirname, '..', 'admin-portal-schema.sql'), 'utf-8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const flat = code.replace(/\s+/g, ' ');
const quotaSql = readFileSync(path.resolve(__dirname, '..', 'ai-usage-schema.sql'), 'utf-8');

function functionBody(name: string): string {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return code.slice(start, code.indexOf('$$;', start)).replace(/\s+/g, ' ');
}

/** Column names of a RETURNS TABLE (...) clause, in order. */
function tableColumns(body: string): string[] {
  const inner = /RETURNS TABLE \((.*?)\) LANGUAGE/.exec(body)![1];
  return inner.split(',').map(c => c.trim().split(' ')[0]);
}

const ADMIN_FNS = [ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN];

describe('admin-portal-schema.sql', () => {
  it('site_admins: idempotent, keyed by the auth user, RLS on, no policy, no client privileges', () => {
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS site_admins ( user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,');
    expect(flat).toContain('ALTER TABLE site_admins ENABLE ROW LEVEL SECURITY;');
    expect(flat).toContain('REVOKE ALL ON site_admins FROM anon, authenticated;');
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/GRANT [A-Z, ]+ ON site_admins/i);
  });

  it('is_site_admin(): no arguments, about auth.uid() only, authenticated only', () => {
    const body = functionBody(IS_SITE_ADMIN_FN);
    expect(body).toContain(`public.${IS_SITE_ADMIN_FN}() RETURNS BOOLEAN`);
    expect(body).toContain('SECURITY DEFINER SET search_path = public');
    expect(body).toContain('WHERE user_id = auth.uid()');
    expect(flat).toContain(`REVOKE ALL ON FUNCTION public.${IS_SITE_ADMIN_FN}() FROM PUBLIC, anon, authenticated;`);
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION public.${IS_SITE_ADMIN_FN}() TO authenticated;`);
  });

  it('the guard raises the client\'s refusal code and is callable by no client role', () => {
    const guard = functionBody('assert_site_admin');
    expect(guard).toContain('auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid())');
    expect(guard).toContain(`USING ERRCODE = '${ADMIN_DENIED_CODE}'`);
    expect(flat).toContain('REVOKE ALL ON FUNCTION public.assert_site_admin() FROM PUBLIC, anon, authenticated;');
    expect(flat).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.assert_site_admin/);
  });

  it('every admin function: SECURITY DEFINER, search_path pinned, guard first, EXECUTE for authenticated only', () => {
    for (const name of ADMIN_FNS) {
      const body = functionBody(name);
      expect(body, name).toContain('SECURITY DEFINER SET search_path = public');
      const begin = body.indexOf('BEGIN');
      expect(body.slice(begin, begin + 50), name).toContain('BEGIN PERFORM public.assert_site_admin();');
      expect(flat).toContain(`REVOKE ALL ON FUNCTION public.${name}() FROM PUBLIC, anon, authenticated;`);
      expect(flat).toContain(`GRANT EXECUTE ON FUNCTION public.${name}() TO authenticated;`);
      expect(flat).not.toContain(`ON FUNCTION public.${name}() TO anon`);
    }
  });

  it('read-only: no admin function writes', () => {
    for (const name of ADMIN_FNS) expect(functionBody(name)).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it('admin_leaders returns the client columns; counts live sign-ups and the quota month\'s Ask AI', () => {
    const body = functionBody(ADMIN_LEADERS_FN);
    expect(tableColumns(body)).toEqual([...ADMIN_LEADER_COLUMNS]);
    expect(body).toContain('s.replaced_at IS NULL');
    expect(body).toContain("q.month = v_month AND q.role = 'ask'");
    // The same month key consume_ai_quota writes (UTC 'YYYY-MM').
    expect(body).toContain("v_month TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');");
    expect(quotaSql).toContain("v_month TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');");
    expect(body).toContain("raw_user_meta_data->>'full_name'");
    expect(body).toContain('ORDER BY u.created_at DESC');
  });

  it('admin_feedback returns the client columns, newest first, never ip_hash', () => {
    const body = functionBody(ADMIN_FEEDBACK_FN);
    expect(tableColumns(body)).toEqual([...ADMIN_FEEDBACK_COLUMNS]);
    expect(body).not.toContain('ip_hash');
    expect(body).toContain('ORDER BY f.created_at DESC');
  });

  it('admin_stats = site_stats() plus the client\'s extra keys; the month is the Los Angeles calendar month', () => {
    const body = functionBody(ADMIN_STATS_FN);
    expect(body).toContain(`RETURN public.${SITE_STATS_FN}() || jsonb_build_object(`);
    for (const key of ADMIN_EXTRA_STATS_KEYS) expect(body).toContain(`'${key}',`);
    expect(body).toContain("date_trunc('month', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles'");
    for (const source of ['u.last_sign_in_at >= v_start', 'p.updated_at >= v_start', 'q.updated_at >= v_start AND q.count > 0']) {
      expect(body).toContain(source);
    }
  });

  it('the owner insert comes last, by email, idempotent', () => {
    const insert = "INSERT INTO site_admins (user_id) SELECT id FROM auth.users WHERE email = 'csheargm@gmail.com' ON CONFLICT (user_id) DO NOTHING;";
    expect(flat.trim().endsWith(insert)).toBe(true);
    expect(flat.split('INSERT INTO site_admins').length).toBe(2);   // the only insert
  });

  it('the privacy page says the owner sees leaders\' names, emails and activity counts; dated today', () => {
    const privacy = readFileSync(path.resolve(__dirname, '..', '..', 'public', 'privacy.html'), 'utf-8');
    expect(privacy).toContain("The site's owner can see leaders' names, emails and activity counts, to run the site.");
    expect(privacy).toContain('更新 Updated 2026-10-11');
  });
});
