/**
 * signupPracticesSchema.test.ts — the multi-practice migration says what the code assumes · 多项操练迁移测试
 *
 * Grep-level pins on database/signup-practices-schema.sql: the practices
 * JSONB column (array-only), the re-created checkin_context returning it
 * next to the legacy columns, by token only, never contact details.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SIGNUPS_TABLE, CHECKIN_CONTEXT_FN } from '../../components/signup/signupSchema';

const sql = readFileSync(path.resolve(__dirname, '../signup-practices-schema.sql'), 'utf-8');

describe('signup-practices-schema.sql', () => {
  it('adds practices JSONB idempotently, constrained to an array', () => {
    expect(sql).toContain(`ALTER TABLE ${SIGNUPS_TABLE} ADD COLUMN IF NOT EXISTS practices JSONB;`);
    expect(sql).toContain(`ALTER TABLE ${SIGNUPS_TABLE} DROP CONSTRAINT IF EXISTS study_signups_practices_array;`);
    expect(sql.replace(/\s+/g, ' ')).toContain("CHECK (practices IS NULL OR jsonb_typeof(practices) = 'array')");
  });

  it('checkin_context: dropped and re-created (return type changed), returns practices + the legacy columns, by token only', () => {
    expect(sql).toContain(`DROP FUNCTION IF EXISTS public.${CHECKIN_CONTEXT_FN}(UUID);`);
    const fn = sql.slice(sql.indexOf(`CREATE FUNCTION public.${CHECKIN_CONTEXT_FN}(`));
    const body = fn.slice(0, fn.indexOf('$$;') + 3);
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain('SET search_path = public');
    expect(body).toContain('WHERE s.id = p_signup_id');
    expect(body).not.toMatch(/\b(phone|email)\b/);
    for (const col of ['practice_area TEXT', 'practice_text TEXT', 'practice_note TEXT', 'feedback_form_url TEXT', 'practices JSONB']) {
      expect(body).toContain(col);
    }
    expect(body).toContain('s.practices');
    expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${CHECKIN_CONTEXT_FN}(UUID) FROM PUBLIC;`);
    expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${CHECKIN_CONTEXT_FN}(UUID) TO anon, authenticated;`);
  });
});
