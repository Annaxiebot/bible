/**
 * signupPackSchema.test.ts — the public projection exposes only what sign-up reads · 报名投影测试
 *
 * Grep-level pins on database/remove-forms-schema.sql (ADR-0006): the
 * function name the client calls, SECURITY DEFINER with a pinned
 * search_path, EXECUTE revoked from PUBLIC and granted to anon +
 * authenticated, and the top-level jsonb_build_object keys are exactly
 * SIGNUP_PACK_KEYS (each life-menu row only area + practice). No other pack
 * section is named anywhere in the function.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { SIGNUP_PACK_FN, SIGNUP_PACK_KEYS } from '../../components/signup/signupSchema';

const sql = readFileSync(path.resolve(__dirname, '../remove-forms-schema.sql'), 'utf-8');
const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n');
const body = code.slice(code.indexOf('AS $$') + 'AS $$'.length, code.indexOf('$$;'));

/** The keys of one jsonb_build_object(...) call starting at `from`: every 'key' in key position. */
function objectKeys(text: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let arg = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
    else if (c === ',' && depth === 1) arg++;
    else if (c === "'" && depth === 1 && arg % 2 === 0) {
      const end = text.indexOf("'", i + 1);
      keys.push(text.slice(i + 1, end));
      i = end;
    }
  }
  return keys;
}

describe('remove-forms-schema.sql (public_signup_pack)', () => {
  it('defines the function the client calls: SECURITY DEFINER, pinned search_path, idempotent', () => {
    expect(code).toContain(`CREATE OR REPLACE FUNCTION public.${SIGNUP_PACK_FN}(p_pack_id TEXT)`);
    expect(code).toMatch(/RETURNS JSONB\s+LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE/);
    expect(body).toMatch(/FROM study_packs sp/);
    expect(body).toMatch(/WHERE sp\.id = p_pack_id;/);
  });

  it('EXECUTE is revoked from PUBLIC and granted to anon + authenticated only', () => {
    expect(code).toContain(`REVOKE ALL ON FUNCTION public.${SIGNUP_PACK_FN}(TEXT) FROM PUBLIC;`);
    expect(code).toContain(`GRANT EXECUTE ON FUNCTION public.${SIGNUP_PACK_FN}(TEXT) TO anon, authenticated;`);
    expect(code.match(/GRANT /g)).toHaveLength(1);
  });

  it('returns exactly the sign-up keys, and each life-menu row only area + practice', () => {
    const outer = body.slice(body.indexOf('jsonb_build_object('));
    expect(objectKeys(outer.slice('jsonb_build_object'.length))).toEqual([...SIGNUP_PACK_KEYS]);
    const row = body.slice(body.indexOf('jsonb_build_object(', body.indexOf("'lifeMenu'")));
    expect(objectKeys(row.slice('jsonb_build_object'.length))).toEqual(['area', 'practice']);
  });

  it('reads only the lifeMenu section and the listed top-level fields from the pack JSON', () => {
    const packFields = [...body.matchAll(/sp\.pack(?:->>|->|\s\?\s)'(\w+)'/g)].map(m => m[1]);
    expect(new Set(packFields)).toEqual(new Set(['passageRef', 'sections']));
    const kinds = [...body.matchAll(/->>'kind' = '(\w+)'/g)].map(m => m[1]);
    expect(kinds).toEqual(['lifeMenu']);
    for (const hidden of ['discussion', 'reflection', 'closing', 'scripture', 'verses', 'questions', 'context']) {
      expect(body, hidden).not.toContain(hidden);
    }
  });
});
