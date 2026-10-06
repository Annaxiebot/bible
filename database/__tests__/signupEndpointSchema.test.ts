/**
 * signupEndpointSchema.test.ts — the direct sign-up paths are closed · 报名直写关闭测试 (ADR-0013)
 *
 * Grep-level pins on database/signup-ip-hash-schema.sql (the ip_hash the
 * function writes and counts) and signup-endpoint-schema.sql (the anon
 * INSERT policy + its helper dropped,
 * INSERT revoked, mark_replaced_signups for service_role only) and on
 * signup-interim-guard.sql (the rate-guard trigger kept as the one copy of
 * the per-pack and per-email caps, raising the code the function maps to
 * 429; the owner-check policy it once created is gone from it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SIGNUPS_TABLE, RATE_GUARD_ERRCODE } from '../../supabase/functions/_shared/signup';
import { MARK_REPLACED_FN } from '../../supabase/functions/send-checkins/replaced';
import { SIGNUPS_TABLE as APP_SIGNUPS_TABLE } from '../../components/signup/signupSchema';
import { STUDY_PACKS_TABLE } from '../../components/newstudy/packRemote';

const read = (file: string) => readFileSync(path.resolve(__dirname, '..', file), 'utf-8');
const sql = read('signup-endpoint-schema.sql');
const ipHash = read('signup-ip-hash-schema.sql');
const guard = read('signup-interim-guard.sql');
const handler = readFileSync(path.resolve(__dirname, '../../supabase/functions/signup/signupHandler.ts'), 'utf-8');

describe('signup-endpoint-schema.sql', () => {
  it('the table names the function uses are the app\'s and the schema\'s', () => {
    expect(APP_SIGNUPS_TABLE).toBe(SIGNUPS_TABLE);
    expect(STUDY_PACKS_TABLE).toBe('study_packs');
    expect(read('study-packs-schema.sql')).toContain(`CREATE TABLE IF NOT EXISTS ${STUDY_PACKS_TABLE} (`);
  });

  it('signup-ip-hash-schema.sql adds ip_hash (the column the function writes and counts) with its index, and closes nothing', () => {
    expect(ipHash).toContain(`ALTER TABLE ${SIGNUPS_TABLE} ADD COLUMN IF NOT EXISTS ip_hash TEXT;`);
    expect(ipHash).toContain(`CREATE INDEX IF NOT EXISTS idx_study_signups_ip_created ON ${SIGNUPS_TABLE}(ip_hash, created_at);`);
    expect(ipHash).not.toMatch(/REVOKE|DROP|POLICY/);
    expect(handler).toMatch(/ip_hash: string;/);
  });

  it('closes the direct insert: the policy and its helper dropped, INSERT revoked from app roles', () => {
    expect(sql).toContain(`DROP POLICY IF EXISTS "Anyone may sign up for an owned pack" ON ${SIGNUPS_TABLE};`);
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.signup_owner_matches(TEXT, UUID);');
    expect(sql.indexOf('DROP POLICY')).toBeLessThan(sql.indexOf('DROP FUNCTION'));   // the policy depends on the helper
    expect(sql).toContain(`REVOKE INSERT ON ${SIGNUPS_TABLE} FROM anon, authenticated;`);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });

  it('mark_replaced_signups: service_role only', () => {
    expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${MARK_REPLACED_FN}(UUID) FROM anon, authenticated, PUBLIC;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${MARK_REPLACED_FN}(UUID) TO service_role;`);
    expect(sql).not.toMatch(/GRANT [^;]* TO (anon|authenticated)/);
  });

  it('documents the release order: column, secret, function, site, send-checkins, then this file', () => {
    const flat = sql.replace(/\n-- ?/g, ' ').replace(/\s+/g, ' ');
    expect(flat).toContain('apply signup-ip-hash-schema.sql, set the IP_HASH_SALT secret, deploy the `signup` function, deploy the site');
    expect(flat).toContain('THEN apply this file');
  });
});

describe('signup-interim-guard.sql (the rate guard that stays)', () => {
  it('keeps the BEFORE INSERT trigger with both caps, raising the errcode the function maps to 429', () => {
    expect(guard).toContain(`CREATE TRIGGER study_signups_rate_guard BEFORE INSERT ON ${SIGNUPS_TABLE}`);
    expect(guard).toMatch(/per_pack_hour CONSTANT INTEGER := \d+;/);
    expect(guard).toMatch(/per_email_day CONSTANT INTEGER := \d+;/);
    expect(guard.match(new RegExp(`USING ERRCODE = '${RATE_GUARD_ERRCODE}'`, 'g'))).toHaveLength(2);
  });

  it('no longer creates the anon insert policy or its helper (dropped by signup-endpoint-schema.sql)', () => {
    expect(guard).not.toContain('CREATE POLICY');
    expect(guard).not.toContain('CREATE OR REPLACE FUNCTION public.signup_owner_matches');
    expect(guard).not.toMatch(/TO anon/);
  });
});
