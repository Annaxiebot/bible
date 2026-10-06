/**
 * siteStatsSchema.test.ts — the site-stats migration says what the client assumes · 全站统计迁移测试 (ADR-0012)
 *
 * Grep-level pins on database/site-stats-schema.sql: both functions are
 * SECURITY DEFINER with a pinned search_path, executable by anon and
 * authenticated and revoked from PUBLIC; site_stats() returns exactly the
 * client's keys (totals, no breakdowns); log_presentation() checks the
 * seconds range, the saved-pack rule and the 2-hour rate limit; the table
 * has RLS with no policy and no client privileges.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  SITE_STATS_FN, LOG_PRESENTATION_FN, SITE_STATS_KEYS, MEETING_MIN_SECONDS, MEETING_MAX_SECONDS, MEETING_RATE_HOURS,
} from '../../components/stats/statsRules';

const sql = readFileSync(path.resolve(__dirname, '..', 'site-stats-schema.sql'), 'utf-8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const flat = code.replace(/\s+/g, ' ');

function functionBody(name: string): string {
  const start = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return code.slice(start, code.indexOf('$$;', start));
}

describe('site-stats-schema.sql', () => {
  it('both functions: SECURITY DEFINER, search_path pinned, EXECUTE for anon + authenticated, revoked from PUBLIC', () => {
    for (const [name, args] of [[SITE_STATS_FN, ''], [LOG_PRESENTATION_FN, 'TEXT, INTEGER']]) {
      expect(functionBody(name).replace(/\s+/g, ' ')).toContain('SECURITY DEFINER SET search_path = public');
      expect(flat).toContain(`REVOKE ALL ON FUNCTION public.${name}(${args}) FROM PUBLIC;`);
      expect(flat).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(${args}) TO anon, authenticated;`);
    }
  });

  it('site_stats returns exactly the client keys + as_of — totals, no per-pack or per-leader breakdown', () => {
    const body = functionBody(SITE_STATS_FN);
    const keys = [...body.matchAll(/'([a-z_]+)', /g)].map(m => m[1]);
    expect(keys).toEqual([...SITE_STATS_KEYS, 'as_of']);
    expect(body).not.toMatch(/GROUP BY|jsonb_agg|array_agg|json_agg|jsonb_object_agg/i);
    expect(body).not.toMatch(/\b(name|email|phone|title|answer)\b/);
    expect(body).toContain('WHERE replaced_at IS NULL');
  });

  it('log_presentation validates the seconds range, requires a saved pack, and rate-limits per pack', () => {
    const body = functionBody(LOG_PRESENTATION_FN).replace(/\s+/g, ' ');
    expect(MEETING_MAX_SECONDS).toBe(21600);
    expect(body).toContain(`p_seconds < ${MEETING_MIN_SECONDS} OR p_seconds > ${MEETING_MAX_SECONDS}`);
    expect(body).toContain('NOT EXISTS (SELECT 1 FROM study_packs WHERE id = p_pack_id) THEN RETURN FALSE;');
    expect(body).toContain('pg_advisory_xact_lock');
    expect(body).toContain(`WHERE pack_id = p_pack_id AND created_at > now() - interval '${MEETING_RATE_HOURS} hours' ) THEN RETURN FALSE;`);
    expect(body).toContain('auth.uid()');
    expect(body).not.toMatch(/p_leader/);   // the presenter comes from the session, never the caller
  });

  it('presentation_sessions: idempotent, RLS on, no policy, no client privileges', () => {
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS presentation_sessions (');
    expect(flat).toContain('ALTER TABLE presentation_sessions ENABLE ROW LEVEL SECURITY;');
    expect(flat).toContain('REVOKE ALL ON presentation_sessions FROM anon, authenticated;');
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/GRANT [A-Z, ]+ ON presentation_sessions/i);
    expect(code).not.toMatch(/\bDROP TABLE\b|\bDELETE FROM\b/i);
  });
});
