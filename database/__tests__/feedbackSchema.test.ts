/**
 * feedbackSchema.test.ts — the feedback migration says what the function assumes · 反馈迁移测试 (ADR-0011)
 *
 * Grep-level pins on database/feedback-schema.sql: idempotent, the CHECKs
 * equal the shared limits, RLS on with NO policy for anon/authenticated and
 * their privileges revoked (only the edge function's service role writes;
 * the owner reads in the dashboard), and the rate-limit index.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { FEEDBACK_MAX_CHARS, FEEDBACK_EMAIL_MAX_CHARS } from '../../supabase/functions/_shared/feedback';
import { FEEDBACK_TABLE } from '../../supabase/functions/feedback/feedbackHandler';

const sql = readFileSync(path.resolve(__dirname, '..', 'feedback-schema.sql'), 'utf-8');
const flat = sql.replace(/\s+/g, ' ');
const code = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

describe('feedback-schema.sql', () => {
  it('creates the table idempotently with the columns the function writes', () => {
    expect(FEEDBACK_TABLE).toBe('feedback');
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS feedback ( id UUID PRIMARY KEY DEFAULT gen_random_uuid(), message TEXT NOT NULL, email TEXT, context JSONB, ip_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() );');
  });

  it('CHECKs equal the shared limits (message 1..2000, email ≤ 200), each dropped before re-adding', () => {
    expect(flat).toContain(`CHECK (char_length(message) BETWEEN 1 AND ${FEEDBACK_MAX_CHARS})`);
    expect(flat).toContain(`CHECK (email IS NULL OR char_length(email) <= ${FEEDBACK_EMAIL_MAX_CHARS})`);
    for (const name of ['feedback_message_length', 'feedback_email_length']) {
      expect(code.indexOf(`DROP CONSTRAINT IF EXISTS ${name}`)).toBeLessThan(code.indexOf(`ADD CONSTRAINT ${name}`));
    }
  });

  it('RLS on, no policy at all, privileges revoked from anon and authenticated', () => {
    expect(code).toContain('ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;');
    expect(code).not.toMatch(/CREATE POLICY/i);
    expect(code).not.toMatch(/\bGRANT\b/i);
    expect(code).toContain('REVOKE ALL ON feedback FROM anon, authenticated;');
    expect(code).not.toMatch(/\bDELETE\b|\bDROP TABLE\b/i);
  });

  it('indexes the rate-limit lookup (ip_hash, created_at)', () => {
    expect(code).toContain('CREATE INDEX IF NOT EXISTS feedback_ip_hash_created_at ON feedback (ip_hash, created_at);');
  });
});
