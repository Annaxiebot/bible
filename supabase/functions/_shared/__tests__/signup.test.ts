/**
 * signup.test.ts — the sign-up's shared rules · 报名规则测试 (ADR-0013)
 *
 * Every problem line is Chinese first ("中文 · English"); the life menu is
 * read from the first lifeMenu section exactly as public_signup_pack reads
 * it (database/remove-forms-schema.sql), so the page never offers a
 * practice the function would refuse.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  SIGNUP_PROBLEM_TEXT, lifeMenuRows, practicesInMenu, normalizePhone, validateSignupBody, signupFieldProblem,
} from '../signup.ts';

const ROW = { area: '工作 Work', practice: '写下忧虑 · Write it down' };

describe('SIGNUP_PROBLEM_TEXT', () => {
  it('every line is "中文 · English", Chinese first', () => {
    for (const line of Object.values(SIGNUP_PROBLEM_TEXT)) expect(line).toMatch(/^[一-鿿][^·]* · [A-Z]/);
  });
});

describe('lifeMenuRows / practicesInMenu', () => {
  it('reads the first lifeMenu section\'s rows, like the SQL projection; no menu → []', () => {
    const pack = { sections: [{ kind: 'title' }, { kind: 'lifeMenu', rows: [ROW] }, { kind: 'lifeMenu', rows: [{ area: 'x', practice: 'y' }] }] };
    expect(lifeMenuRows(pack)).toEqual([ROW]);
    expect(lifeMenuRows({ sections: [{ kind: 'lifeMenu' }] })).toEqual([]);
    expect(lifeMenuRows(null)).toEqual([]);
    const sql = readFileSync(path.resolve(__dirname, '../../../../database/remove-forms-schema.sql'), 'utf-8');
    expect(sql).toContain("WHERE s.section->>'kind' = 'lifeMenu'");
    expect(sql).toMatch(/ORDER BY s\.idx\s+LIMIT 1/);
  });

  it('a choice matches only a row with the same area and the same text', () => {
    expect(practicesInMenu([ROW], [ROW])).toBe(true);
    expect(practicesInMenu([{ ...ROW, area: 'other' }], [ROW])).toBe(false);
    expect(practicesInMenu([ROW], [])).toBe(false);
  });
});

describe('validation', () => {
  it('phones are normalised before the E.164-ish check', () => {
    expect(normalizePhone('+1 (408) 555-1234')).toBe('+14085551234');
    expect(signupFieldProblem({ name: 'A', email: 'a@b.co', phone: '+1 (408) 555-1234', practices: [ROW], practice_note: '' })).toBeNull();
  });

  it('a valid body is trimmed; empty optionals become null', () => {
    const verdict = validateSignupBody({ pack_id: ' p1 ', name: ' A ', email: ' a@b.co ', practices: [ROW], consent: true });
    expect(verdict).toEqual({ ok: true, value: { pack_id: 'p1', name: 'A', email: 'a@b.co', phone: null, practices: [ROW], practice_note: null, consent: true } });
  });
});
