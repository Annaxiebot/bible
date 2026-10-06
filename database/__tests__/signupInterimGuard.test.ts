/**
 * signupInterimGuard.test.ts — the interim sign-up guard, as text and live · 报名临时防护
 *
 * Always: grep-level pins on database/signup-interim-guard.sql (the insert
 * policy requires the pack's real owner; the trigger caps per pack-hour and
 * per pack+email-day with bilingual messages).
 * LIVE_DB=1 (+ token, linked project): one DO block as anon proves the three
 * behaviours on the real tables — a spoofed pack/leader pair is refused by
 * RLS, a real pack's sign-up is accepted, the 6th same-email sign-up in a
 * day is refused — then RAISE EXCEPTION rolls everything back (owner rule:
 * never leave test data in live tables).
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
  it('requires the pack\'s real owner on the anon insert policy', () => {
    expect(sql).toContain(`ON ${SIGNUPS_TABLE} FOR INSERT`);
    expect(sql.replace(/\s+/g, ' ')).toContain(
      'WITH CHECK (leader_id IS NOT NULL AND public.signup_owner_matches(pack_id, leader_id))');
    expect(sql).toContain('WHERE id = p_pack_id AND leader_id = p_leader_id');
  });

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
  p record; spoof text := 'accepted'; real_ok text := 'refused'; sixth text := 'accepted'; i int;
BEGIN
  SELECT id, leader_id INTO p FROM study_packs LIMIT 1;
  IF p.id IS NULL THEN RAISE EXCEPTION 'NOPACK'; END IF;
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN ${insertAs("'probe-no-such-pack'", 'p.leader_id')};
  EXCEPTION WHEN insufficient_privilege THEN spoof := 'refused'; END;
  ${insertAs('p.id', 'p.leader_id')}; real_ok := 'accepted';
  BEGIN
    FOR i IN 2..${PER_EMAIL_DAY + 1} LOOP ${insertAs('p.id', 'p.leader_id')}; END LOOP;
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE '%Too many sign-ups with this email%' THEN sixth := 'refused'; END IF; END;
  RAISE EXCEPTION 'PROBE:%', jsonb_build_object('spoof', spoof, 'real', real_ok, 'sixth', sixth);
END $do$;`;

describe.skipIf(!LIVE)('interim sign-up guard — live probe (rolled back)', () => {
  it('refuses a spoofed owner, accepts a real sign-up, refuses the 6th same-email sign-up', async () => {
    const { text } = await runSql(PROBE_SQL);
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /PROBE:(\{.*\})\s*(?:\n|$)/.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    expect(JSON.parse(match![1])).toEqual({ spoof: 'refused', real: 'accepted', sixth: 'refused' });
    const left = await runSql(`SELECT count(*)::int AS n FROM ${SIGNUPS_TABLE} WHERE email = '${PROBE_EMAIL}'`);
    expect(left.text).toContain('"n":0');
  });
});
