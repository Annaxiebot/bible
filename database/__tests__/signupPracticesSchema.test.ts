/**
 * signupPracticesSchema.test.ts — the multi-practice migration says what the code assumes · 多项操练迁移测试
 *
 * Grep-level pins on database/signup-practices-schema.sql: the practices
 * JSONB column (array-only). checkin_context moved to
 * checkin-optout-schema.sql (pinned in checkinOptoutSchema.test.ts).
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

  it('does not define checkin_context any more — its one definition is in checkin-optout-schema.sql', () => {
    expect(sql).not.toMatch(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${CHECKIN_CONTEXT_FN}\\(`));
    expect(sql).toContain('database/checkin-optout-schema.sql');
  });
});
