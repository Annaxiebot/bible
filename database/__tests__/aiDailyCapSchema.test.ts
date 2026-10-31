/**
 * aiDailyCapSchema.test.ts — the daily-cap migration says what the proxy assumes · 每日上限迁移文本测试
 *
 * Grep-level pins on database/ai-daily-cap-schema.sql (ADR-0007 "Caps"): the
 * table and function names caps.ts calls, the role list, no client access,
 * the -2 day-full answer under a row lock, the monthly count delegated to the
 * unchanged consume_ai_quota, and a function only the service role may run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { AI_ROLES, QUOTA_FUNCTION } from '../../supabase/functions/ai-proxy/policy.ts';
import { DAILY_QUOTA_FUNCTION, SITE_DAILY_TABLE, QUOTA_RESULT } from '../../supabase/functions/ai-proxy/caps.ts';

const sql = readFileSync(path.resolve(__dirname, '../ai-daily-cap-schema.sql'), 'utf-8');
const flat = sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
const signature = `public.${DAILY_QUOTA_FUNCTION}(UUID, TEXT, INT, INT)`;

describe('ai-daily-cap-schema.sql', () => {
  it('one counter per UTC day × role, roles = the proxy\'s list, additive (IF NOT EXISTS)', () => {
    expect(SITE_DAILY_TABLE).toBe('ai_site_daily');
    expect(flat).toContain(`CREATE TABLE IF NOT EXISTS ${SITE_DAILY_TABLE} (`);
    expect(flat).toContain(`CHECK (role IN (${AI_ROLES.map(r => `'${r}'`).join(', ')}))`);
    expect(flat).toContain('PRIMARY KEY (day, role)');
    expect(flat).toContain("timezone('UTC', now())::date");
    expect(flat).not.toMatch(/user_id|leader_id UUID/);   // counts only, nobody's id
  });

  it('no client access: RLS on, no policy, privileges revoked', () => {
    expect(flat).toContain(`ALTER TABLE ${SITE_DAILY_TABLE} ENABLE ROW LEVEL SECURITY;`);
    expect(flat).not.toMatch(/CREATE POLICY/);
    expect(flat).toContain(`REVOKE ALL ON ${SITE_DAILY_TABLE} FROM anon, authenticated;`);
  });

  it('the function locks the day row, answers -2 when full, and delegates the month to consume_ai_quota', () => {
    expect(flat).toContain(`CREATE OR REPLACE FUNCTION public.${DAILY_QUOTA_FUNCTION}(p_leader UUID, p_role TEXT, p_limit INT, p_daily_limit INT) RETURNS INT`);
    expect(flat).toContain('SECURITY DEFINER');
    expect(flat).toContain('SET search_path = public');
    expect(flat).toContain('FOR UPDATE');
    expect(flat).toContain('IF v_site >= p_daily_limit THEN RETURN -2;');
    expect(QUOTA_RESULT.dailyFull).toBe(-2);
    expect(flat).toContain(`RETURN public.${QUOTA_FUNCTION}(p_leader, p_role, p_limit);`);   // no daily cap: unchanged path
    expect(flat).toContain(`v_count := public.${QUOTA_FUNCTION}(p_leader, p_role, p_limit);`);
    // The day is counted only after the month accepted the call (a refused call spends neither).
    expect(flat.indexOf(`v_count := public.${QUOTA_FUNCTION}`)).toBeLessThan(flat.indexOf('SET count = count + 1'));
  });

  it('service role only', () => {
    expect(flat).toContain(`REVOKE EXECUTE ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated;`);
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`);
  });
});
