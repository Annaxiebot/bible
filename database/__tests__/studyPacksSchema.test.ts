/**
 * studyPacksSchema.test.ts — the migration says what the code assumes · 迁移文本测试
 *
 * Grep-level pins on database/study-packs-schema.sql (ADR-0006): the table
 * name the client uses, the owner column, RLS on, exactly the four
 * owner-only policies (all `authenticated`, all `auth.uid() = leader_id`),
 * nothing for anon, and idempotent statements.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { STUDY_PACKS_TABLE } from '../../components/newstudy/packRemote';

const sql = readFileSync(path.resolve(__dirname, '../study-packs-schema.sql'), 'utf-8');
const statements = (re: RegExp) => [...sql.matchAll(re)].map(m => m[0].replace(/\s+/g, ' '));

describe('study-packs-schema.sql', () => {
  it('creates the table the client writes, with an owner, the JSON and timestamps', () => {
    const start = sql.indexOf(`CREATE TABLE IF NOT EXISTS ${STUDY_PACKS_TABLE} (`);
    expect(start).toBeGreaterThanOrEqual(0);
    const body = sql.slice(start, sql.indexOf(');', start));
    expect(body).toMatch(/id TEXT PRIMARY KEY/);
    expect(body).toMatch(/leader_id UUID NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
    expect(body).toMatch(/pack JSONB NOT NULL/);
    expect(body).toMatch(/updated_at TIMESTAMPTZ/);
    expect(sql).toContain(`ALTER TABLE ${STUDY_PACKS_TABLE} ENABLE ROW LEVEL SECURITY;`);
    expect(sql).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS \\w+ ON ${STUDY_PACKS_TABLE}\\(leader_id\\)`));
  });

  it('has exactly four owner-only policies (SELECT, INSERT, UPDATE, DELETE) and nothing for anon', () => {
    const policies = statements(/CREATE POLICY "[^"]+"[^;]+;/g);
    expect(policies).toHaveLength(4);
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const policy = policies.find(p => p.includes(`FOR ${cmd}`))!;
      expect(policy, cmd).toContain(`ON ${STUDY_PACKS_TABLE}`);
      expect(policy, cmd).toContain('TO authenticated');
      expect(policy, cmd).toContain('auth.uid() = leader_id');
    }
    expect(sql).not.toMatch(/TO\s+anon/);
  });

  it('is idempotent: every policy and the trigger are dropped before they are created', () => {
    for (const name of statements(/CREATE POLICY "([^"]+)"/g)) {
      const policyName = name.slice('CREATE POLICY '.length);
      expect(sql).toContain(`DROP POLICY IF EXISTS ${policyName} ON ${STUDY_PACKS_TABLE};`);
    }
    expect(sql).toContain(`DROP TRIGGER IF EXISTS study_packs_touch ON ${STUDY_PACKS_TABLE};`);
  });
});
