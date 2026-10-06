/**
 * signupInterimGuard.test.ts — the interim sign-up guard, as text and live · 报名临时防护
 *
 * Always: grep-level pins on database/signup-interim-guard.sql (the trigger
 * caps per pack-hour and per pack+email-day with bilingual messages).
 * LIVE_DB=1 (+ token, linked project), after the ADR-0013 release: one DO
 * block proves on the real tables that anon cannot insert at all, not even
 * for a real pack and its real leader, and that the trigger refuses the 6th
 * same-email sign-up in a day for the table owner too (the signup
 * function's service-role path) — then RAISE EXCEPTION rolls everything
 * back (owner rule: never leave test data in live tables).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { LIVE, runSql } from './liveSql';
import { SIGNUPS_TABLE } from '../../components/signup/signupSchema';

const sql = readFileSync(path.resolve(__dirname, '../signup-interim-guard.sql'), 'utf-8');
const PER_PACK_HOUR = 60;
const PER_EMAIL_DAY = 5;
const PROBE_EMAIL = 'probe@example.invalid';

describe('signup-interim-guard.sql', () => {
  it('caps sign-ups per pack per hour and per pack + email per day, with bilingual messages', () => {
    expect(sql).toContain(`per_pack_hour CONSTANT INTEGER := ${PER_PACK_HOUR};`);
    expect(sql).toContain(`per_email_day CONSTANT INTEGER := ${PER_EMAIL_DAY};`);
    expect(sql).toContain(`BEFORE INSERT ON ${SIGNUPS_TABLE}`);
    expect(sql).toMatch(/RAISE EXCEPTION '[^']*查经[^']*·[^']*Too many sign-ups for this study/);
    expect(sql).toMatch(/RAISE EXCEPTION '[^']*电邮[^']*·[^']*Too many sign-ups with this email/);
  });
});

const insertAs = (pack: string, leader: string) =>
  `INSERT INTO ${SIGNUPS_TABLE} (id, pack_id, leader_id, pack_title, name, email, consent_checkins, locale)
   VALUES (gen_random_uuid(), ${pack}, ${leader}, 'probe', 'probe', '${PROBE_EMAIL}', true, 'zh')`;

const PROBE_SQL = `DO $do$ DECLARE
  p record; anon_insert text := 'accepted'; owner_insert text := 'refused'; sixth text := 'accepted'; i int;
BEGIN
  SELECT id, leader_id INTO p FROM study_packs LIMIT 1;
  IF p.id IS NULL THEN RAISE EXCEPTION 'NOPACK'; END IF;
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN ${insertAs('p.id', 'p.leader_id')};
  EXCEPTION WHEN insufficient_privilege THEN anon_insert := 'refused'; END;
  EXECUTE 'RESET ROLE';
  ${insertAs('p.id', 'p.leader_id')}; owner_insert := 'accepted';
  BEGIN
    FOR i IN 2..${PER_EMAIL_DAY + 1} LOOP ${insertAs('p.id', 'p.leader_id')}; END LOOP;
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '%Too many sign-ups with this email%' THEN sixth := 'refused'; END IF; END;
  RAISE EXCEPTION 'PROBE:%', jsonb_build_object('anon', anon_insert, 'owner', owner_insert, 'sixth', sixth);
END $do$;`;

describe.skipIf(!LIVE)('interim sign-up guard — live probe (rolled back)', () => {
  it('anon cannot insert even for a real pack; the trigger refuses the 6th same-email sign-up', async () => {
    const { text } = await runSql(PROBE_SQL);
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /PROBE:(\{.*\})\s*(?:\n|$)/.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    expect(JSON.parse(match![1])).toEqual({ anon: 'refused', owner: 'accepted', sixth: 'refused' });
    const left = await runSql(`SELECT count(*)::int AS n FROM ${SIGNUPS_TABLE} WHERE email = '${PROBE_EMAIL}'`);
    expect(left.text).toContain('"n":0');
  });
});
