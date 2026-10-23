/**
 * funnelSchema.test.ts — the funnel migration says what the browser and the portal assume · 漏斗迁移文本测试 (ADR-0025)
 *
 * Grep-level pins on database/funnel-schema.sql: the event list (table CHECK
 * and the function's own check) equals FUNNEL_EVENTS; only the outcomes take
 * a wait, in 0..FUNNEL_MAX_WAIT_SECONDS; the per-day ceiling and the admin
 * window's limit equal the client's; the day is the Los Angeles day; nothing
 * that identifies anyone is stored; the table is closed to clients;
 * log_funnel_event is open to anon + authenticated, admin_funnel to
 * authenticated only and guarded by assert_site_admin() before anything
 * else. Also: the privacy page carries the one Chinese-first line.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  LOG_FUNNEL_FN, ADMIN_FUNNEL_FN, FUNNEL_EVENTS, FUNNEL_WAIT_EVENTS, FUNNEL_MAX_WAIT_SECONDS, FUNNEL_DAILY_CEILING,
  FUNNEL_MAX_DAYS, FUNNEL_DAYS,
} from '../../components/stats/funnelRules';
import { CHECKIN_TIMEZONE } from '../../supabase/functions/send-checkins/templates';

const sql = readFileSync(path.resolve(__dirname, '..', 'funnel-schema.sql'), 'utf-8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).map(l => l.replace(/\s--.*$/, '')).join('\n');
const flat = code.replace(/\s+/g, ' ');

function functionBody(name: string): string {
  const start = flat.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start, name).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf('$$;', start));
}
const quoted = (list: readonly string[]) => list.map(e => `'${e}'`).join(', ');

describe('funnel-schema.sql', () => {
  it('the table: one row per day × event, the CHECK list = FUNNEL_EVENTS, counts and waits only', () => {
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS funnel_daily (');
    expect(flat).toContain(`event TEXT NOT NULL CHECK (event IN ( ${quoted(FUNNEL_EVENTS)} ))`);
    expect(flat).toContain('PRIMARY KEY (day, event)');
    // Exactly four columns: nobody's id, no IP, no token, no pack, no timestamp.
    const table = flat.slice(flat.indexOf('CREATE TABLE IF NOT EXISTS funnel_daily'), flat.indexOf('PRIMARY KEY (day, event)'));
    const columns = [...table.matchAll(/(?:\(|,) (\w+) (?:DATE|TEXT|INT|BIGINT|UUID|TIMESTAMPTZ|INET|JSONB|BYTEA)\b/g)].map(m => m[1]);
    expect(columns).toEqual(['day', 'event', 'count', 'waits']);
  });

  it('no client access to the table: RLS on, no policy, privileges revoked', () => {
    expect(flat).toContain('ALTER TABLE funnel_daily ENABLE ROW LEVEL SECURITY;');
    expect(flat).toContain('REVOKE ALL ON funnel_daily FROM anon, authenticated;');
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/GRANT [A-Z, ]+ ON funnel_daily/i);
    expect(code).not.toMatch(/\bDROP TABLE\b|\bDELETE FROM\b|\bTRUNCATE\b/i);
  });

  it('log_funnel_event: the server checks the event, the wait, the day and the ceiling', () => {
    const body = functionBody(LOG_FUNNEL_FN);
    expect(body).toContain(`public.${LOG_FUNNEL_FN}(p_event TEXT, p_wait_seconds INT) RETURNS BOOLEAN`);
    expect(body).toContain('SECURITY DEFINER SET search_path = public');
    expect(body).toContain(`p_event NOT IN ( ${quoted(FUNNEL_EVENTS)} ) THEN RAISE EXCEPTION`);
    expect(body).toContain(`v_outcome BOOLEAN := p_event IN (${quoted(FUNNEL_WAIT_EVENTS)});`);
    expect(body).toContain(`p_wait_seconds < 0 OR p_wait_seconds > ${FUNNEL_MAX_WAIT_SECONDS}`);
    expect(body).toContain('IF NOT v_outcome AND p_wait_seconds IS NOT NULL THEN RAISE EXCEPTION');
    expect(body.match(/ERRCODE = '22023'/g)).toHaveLength(3);
    expect(body).toContain(`(now() AT TIME ZONE '${CHECKIN_TIMEZONE}')::date`);
    expect(body).toContain(`WHERE f.count < ${FUNNEL_DAILY_CEILING};`);
    expect(body).toContain('RETURN FOUND;');
    expect(body).not.toMatch(/auth\.uid\(\)|request\.headers|p_day/);   // never who, never the caller's day
    expect(flat).toContain(`REVOKE ALL ON FUNCTION public.${LOG_FUNNEL_FN}(TEXT, INT) FROM PUBLIC;`);
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION public.${LOG_FUNNEL_FN}(TEXT, INT) TO anon, authenticated;`);
  });

  it('admin_funnel: site admins only (the guard first), a bounded window, day rows + window rows', () => {
    const body = functionBody(ADMIN_FUNNEL_FN);
    expect(body).toContain('RETURNS TABLE (day DATE, event TEXT, count INT, median_wait_seconds INT)');
    expect(body).toContain('STABLE SECURITY DEFINER SET search_path = public');
    const begin = body.indexOf('BEGIN');
    expect(body.slice(begin, begin + 50)).toContain('PERFORM public.assert_site_admin();');
    expect(FUNNEL_DAYS).toBeLessThanOrEqual(FUNNEL_MAX_DAYS);
    expect(body).toContain(`p_days < 1 OR p_days > ${FUNNEL_MAX_DAYS} THEN RAISE EXCEPTION`);
    expect(body).toContain(`(now() AT TIME ZONE '${CHECKIN_TIMEZONE}')::date - (p_days - 1)`);
    expect(body).toContain('percentile_cont(0.5) WITHIN GROUP');
    expect(body).toContain('UNION ALL SELECT NULL::DATE, f.event, sum(f.count)::INT');
    expect(flat).toContain(`REVOKE ALL ON FUNCTION public.${ADMIN_FUNNEL_FN}(INT) FROM PUBLIC, anon, authenticated;`);
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION public.${ADMIN_FUNNEL_FN}(INT) TO authenticated;`);
  });
});

describe('the privacy page (ADR-0025: in the same release)', () => {
  const privacy = readFileSync(path.resolve(__dirname, '..', '..', 'public', 'privacy.html'), 'utf-8');
  it('says anonymous totals are counted, Chinese first', () => {
    expect(privacy).toContain('匿名总数：本站按天统计「新建查经」被打开');
    expect(privacy).toContain('totals only, never who, no cookies, no third-party analytics');
    expect(privacy.indexOf('匿名总数：')).toBeLessThan(privacy.indexOf('Anonymous totals:'));
    expect(privacy).toContain('更新 Updated 2026-10-23');
  });
});
