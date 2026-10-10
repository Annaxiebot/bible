/**
 * askAiHistorySchema.test.ts — the Ask AI history migration says what the client assumes · 问一问记录迁移测试 (ADR-0021)
 *
 * Grep-level pins on database/ask-ai-history-schema.sql: the table and its
 * cascades (study + account), the length CHECKs equal the client's caps,
 * owner-only SELECT/DELETE, INSERT/UPDATE revoked (the RPC is the one
 * writer), nothing for anon; the RPC is SECURITY DEFINER with a pinned
 * search_path, takes the uid from the session, locks the pack, enforces
 * the limit with the client's refusal code, and stores the permission; the
 * permission column is on study_packs. Also: the privacy page says so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  ASK_HISTORY_LIMIT, ASK_HISTORY_TABLE, SAVE_ASK_EXCHANGE_FN, ASK_HISTORY_FULL_CODE, ASK_REPLACE_COLUMN,
  ASK_QUESTION_MAX_CHARS, ASK_ANSWER_MAX_CHARS,
} from '../../components/studypack/askHistoryRules';
import { STUDY_PACKS_TABLE } from '../../components/newstudy/packRemote';

const sql = readFileSync(path.resolve(__dirname, '..', 'ask-ai-history-schema.sql'), 'utf-8');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const flat = code.replace(/\s+/g, ' ');
const SIGNATURE = `public.${SAVE_ASK_EXCHANGE_FN}(TEXT, TEXT, TEXT, TEXT, BOOLEAN)`;

function rpcBody(): string {
  const start = flat.indexOf(`CREATE OR REPLACE FUNCTION public.${SAVE_ASK_EXCHANGE_FN}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return flat.slice(start, flat.indexOf('$$;', start));
}

describe('ask-ai-history-schema.sql', () => {
  it('table: owner + pack with cascades, length CHECKs equal to the client caps, model, created_at, the lookup index', () => {
    const start = flat.indexOf(`CREATE TABLE IF NOT EXISTS ${ASK_HISTORY_TABLE} (`);
    expect(start).toBeGreaterThanOrEqual(0);
    const body = flat.slice(start, flat.indexOf(');', start));
    expect(body).toContain('id UUID PRIMARY KEY DEFAULT gen_random_uuid()');
    expect(body).toContain('leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE');
    expect(body).toContain(`pack_id TEXT NOT NULL REFERENCES ${STUDY_PACKS_TABLE}(id) ON DELETE CASCADE`);
    expect(body).toContain(`question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND ${ASK_QUESTION_MAX_CHARS})`);
    expect(body).toContain(`answer TEXT NOT NULL CHECK (char_length(answer) BETWEEN 1 AND ${ASK_ANSWER_MAX_CHARS})`);
    expect(body).toContain('model TEXT');
    expect(body).toContain('created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
    expect(flat).toMatch(new RegExp(`CREATE INDEX IF NOT EXISTS \\w+ ON ${ASK_HISTORY_TABLE} \\(leader_id, pack_id, created_at\\)`));
  });

  it('RLS on; owner-only SELECT and DELETE; INSERT only for the caller\'s own pack; no client INSERT/UPDATE grant; nothing for anon', () => {
    expect(flat).toContain(`ALTER TABLE ${ASK_HISTORY_TABLE} ENABLE ROW LEVEL SECURITY;`);
    expect(flat).toContain(`REVOKE ALL ON ${ASK_HISTORY_TABLE} FROM anon, authenticated;`);
    expect(flat).toContain(`GRANT SELECT, DELETE ON ${ASK_HISTORY_TABLE} TO authenticated;`);
    expect(code).not.toMatch(new RegExp(`GRANT [A-Z, ]*(INSERT|UPDATE|ALL)[A-Z, ]* ON ${ASK_HISTORY_TABLE}`, 'i'));
    const policies = [...flat.matchAll(/CREATE POLICY "[^"]+" ON (\w+) FOR (\w+) TO (\w+) (?:USING|WITH CHECK) \((.+?)\);/g)];
    expect(policies.map(p => [p[1], p[2], p[3]])).toEqual([
      [ASK_HISTORY_TABLE, 'SELECT', 'authenticated'],
      [ASK_HISTORY_TABLE, 'DELETE', 'authenticated'],
      [ASK_HISTORY_TABLE, 'INSERT', 'authenticated'],
    ]);
    for (const p of policies) expect(p[4]).toContain('auth.uid() = leader_id');
    expect(policies[2][4]).toContain(`EXISTS (SELECT 1 FROM ${STUDY_PACKS_TABLE} sp WHERE sp.id = pack_id AND sp.leader_id = auth.uid())`);
    expect(code).not.toMatch(/TO\s+anon/);
    for (const name of [...sql.matchAll(/CREATE POLICY "([^"]+)"/g)].map(m => m[1])) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${name}" ON ${ASK_HISTORY_TABLE};`);
    }
  });

  it('the per-study permission is a column on study_packs, off by default', () => {
    expect(flat).toContain(`ALTER TABLE ${STUDY_PACKS_TABLE} ADD COLUMN IF NOT EXISTS ${ASK_REPLACE_COLUMN} BOOLEAN NOT NULL DEFAULT FALSE;`);
  });

  it('the RPC: SECURITY DEFINER, pinned search_path, authenticated only, the uid from the session', () => {
    const body = rpcBody();
    expect(body).toContain('SECURITY DEFINER SET search_path = public');
    expect(body).toContain('v_uid UUID := auth.uid();');
    expect(body).not.toMatch(/p_leader/);
    expect(flat).toContain(`REVOKE ALL ON FUNCTION ${SIGNATURE} FROM PUBLIC, anon;`);
    expect(flat).toContain(`GRANT EXECUTE ON FUNCTION ${SIGNATURE} TO authenticated;`);
  });

  it('the RPC: own pack locked, the limit with the client refusal code, replace drops the oldest, permission stored', () => {
    const body = rpcBody();
    expect(body).toContain(`FROM ${STUDY_PACKS_TABLE} WHERE id = p_pack_id AND leader_id = v_uid FOR UPDATE;`);
    expect(body).toContain(`NOT BETWEEN 1 AND ${ASK_QUESTION_MAX_CHARS}`);
    expect(body).toContain(`NOT BETWEEN 1 AND ${ASK_ANSWER_MAX_CHARS}`);
    expect(body).toContain(`IF v_count >= ${ASK_HISTORY_LIMIT} THEN`);
    expect(body).toContain(`USING ERRCODE = '${ASK_HISTORY_FULL_CODE}'`);
    expect(body).toContain('IF NOT (coalesce(p_replace_oldest, FALSE) OR v_allowed) THEN');
    expect(body).toContain(`ORDER BY created_at, id LIMIT v_count - ${ASK_HISTORY_LIMIT} + 1`);
    expect(body).toContain(`UPDATE ${STUDY_PACKS_TABLE} SET ${ASK_REPLACE_COLUMN} = TRUE WHERE id = p_pack_id AND leader_id = v_uid;`);
    expect(body).toContain("RETURN CASE WHEN v_replaced THEN 'replaced' ELSE 'saved' END;");
  });

  it('is idempotent and never drops or empties a table', () => {
    expect(code).not.toMatch(/\bDROP TABLE\b|\bTRUNCATE\b/i);
    expect(code).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(code).not.toMatch(/CREATE FUNCTION/);
  });

  it('the privacy page says Ask AI history is saved for the leader only, deletable, deleted with the study or account', () => {
    const privacy = readFileSync(path.resolve(__dirname, '..', '..', 'public', 'privacy.html'), 'utf-8');
    expect(privacy).toContain("Ask AI questions and answers on a leader's own studies are saved to that leader's account");
    expect(privacy).toContain('are deleted with the study or the account');
    expect(privacy).toContain('apart from the Ask AI history on a leader\'s own studies');   // the relay line no longer says "nothing stored"
    expect(privacy).toContain('更新 Updated 2026-10-09');
  });
});
