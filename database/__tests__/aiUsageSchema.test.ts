/**
 * aiUsageSchema.test.ts — the quota migration says what the code assumes · 用量迁移文本测试
 *
 * Grep-level pins on database/ai-usage-schema.sql: the table and function
 * names the Edge Function and #/setup use, the roles, SELECT-own-rows RLS
 * with no client writes, and a quota function only the service role may run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { AI_USAGE_TABLE, QUOTA_FUNCTION, AI_ROLES } from '../../supabase/functions/ai-proxy/policy.ts';

const sql = readFileSync(path.resolve(__dirname, '../ai-usage-schema.sql'), 'utf-8');
const flat = sql.replace(/\s+/g, ' ');
const pickRaw = readFileSync(path.resolve(__dirname, '../ai-usage-pick-role.sql'), 'utf-8');
const pickSql = pickRaw.replace(/\s+/g, ' ');
const roleCheck = `CHECK (role IN (${AI_ROLES.map(r => `'${r}'`).join(', ')}))`;

describe('ai-usage-schema.sql', () => {
  it('creates the table the code reads, keyed by leader × month × role, cascading with the account', () => {
    expect(AI_USAGE_TABLE).toBe('ai_usage');
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${AI_USAGE_TABLE} (`);
    expect(flat).toContain('leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE');
    expect(flat).toContain('count INT NOT NULL DEFAULT 0');
    expect(flat).toContain('PRIMARY KEY (leader_id, month, role)');
    expect(flat).toContain(roleCheck);
    // Re-runnable: the CHECK is dropped and re-added, so a table made with an older role list widens.
    expect(flat).toContain(`ALTER TABLE ${AI_USAGE_TABLE} DROP CONSTRAINT IF EXISTS ai_usage_role_check;`);
    expect(flat).toContain(`ALTER TABLE ${AI_USAGE_TABLE} ADD CONSTRAINT ai_usage_role_check CHECK (role IN (`);
  });

  it('RLS: one SELECT policy on own rows; no write policy; writes revoked from clients', () => {
    expect(sql).toContain(`ALTER TABLE ${AI_USAGE_TABLE} ENABLE ROW LEVEL SECURITY;`);
    expect(flat).toMatch(/CREATE POLICY "[^"]+" ON ai_usage FOR SELECT TO authenticated USING \(auth\.uid\(\) = leader_id\);/);
    expect(flat).not.toMatch(/ON ai_usage FOR (INSERT|UPDATE|DELETE|ALL)/);
    expect(flat).toContain('REVOKE INSERT, UPDATE, DELETE ON ai_usage FROM anon, authenticated;');
  });

  it('the quota function is SECURITY DEFINER, increments only under the limit, and is service-role only', () => {
    expect(QUOTA_FUNCTION).toBe('consume_ai_quota');
    expect(flat).toContain(`FUNCTION public.${QUOTA_FUNCTION}(p_leader UUID, p_role TEXT, p_limit INT) RETURNS INT`);
    expect(flat).toContain('SECURITY DEFINER');
    expect(flat).toContain('SET search_path = public');
    expect(flat).toContain('AND count < p_limit');
    expect(flat).toContain('RETURN -1;');
    expect(flat).toContain(`REVOKE EXECUTE ON FUNCTION public.${QUOTA_FUNCTION}(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;`);
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION public.${QUOTA_FUNCTION}(UUID, TEXT, INT) TO service_role;`);
  });

  it('months are UTC YYYY-MM (the browser reads the same key: components/setup/aiUsage currentUsageMonth)', () => {
    expect(flat).toContain("to_char(timezone('UTC', now()), 'YYYY-MM')");
  });

  it('ai-usage-pick-role.sql (ADR-0016) widens the live CHECK to the same role list, re-runnably, and touches nothing else', () => {
    expect(AI_ROLES).toContain('pick');
    expect(pickSql).toContain(`ALTER TABLE ${AI_USAGE_TABLE} DROP CONSTRAINT IF EXISTS ai_usage_role_check;`);
    expect(pickSql).toContain(`ALTER TABLE ${AI_USAGE_TABLE} ADD CONSTRAINT ai_usage_role_check ${roleCheck};`);
    const statements = pickRaw.replace(/--[^\n]*/g, '').split(';').map(x => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(2);
  });
});
