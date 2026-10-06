/**
 * checkinAnswerUpsert.live.test.ts — sharing twice keeps one answer, on the REAL database · 分享只保留一条
 *
 * Opt-in (LIVE_DB=1 + token + linked project; skipped otherwise). One DO
 * block as anon: share an answer for an existing sign-up's check-in, share
 * again with new text, then count — one row, holding the second text.
 * RAISE EXCEPTION rolls everything back (owner rule: never leave test data
 * in live tables).
 */
import { describe, it, expect } from 'vitest';
import { LIVE, runSql } from './liveSql';
import { SHARE_ANSWER_FN, CHECKIN_ANSWERS_TABLE } from '../../components/signup/signupSchema';

const KIND = 'weekend';
const PROBE_SQL = `DO $do$ DECLARE v_signup uuid; a uuid; b uuid; n int; txt text;
BEGIN
  SELECT s.id INTO v_signup FROM study_signups s WHERE NOT EXISTS (
    SELECT 1 FROM ${CHECKIN_ANSWERS_TABLE} c WHERE c.signup_id = s.id AND c.kind = '${KIND}') LIMIT 1;
  IF v_signup IS NULL THEN RAISE EXCEPTION 'NOSIGNUP'; END IF;
  EXECUTE 'SET LOCAL ROLE anon';
  a := public.${SHARE_ANSWER_FN}(v_signup, '${KIND}', 'probe first');
  b := public.${SHARE_ANSWER_FN}(v_signup, '${KIND}', 'probe second');
  EXECUTE 'RESET ROLE';
  SELECT count(*), max(answer) INTO n, txt FROM ${CHECKIN_ANSWERS_TABLE} WHERE signup_id = v_signup AND kind = '${KIND}';
  RAISE EXCEPTION 'PROBE:%', jsonb_build_object('rows', n, 'answer', txt, 'same_id', a = b);
END $do$;`;

describe.skipIf(!LIVE)('share_checkin_answer upsert — live probe (rolled back)', () => {
  it('sharing twice leaves one row with the latest text', async () => {
    const { text } = await runSql(PROBE_SQL);
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /PROBE:(\{.*\})\s*(?:\n|$)/.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    expect(JSON.parse(match![1])).toEqual({ rows: 1, answer: 'probe second', same_id: true });
    const left = await runSql(`SELECT count(*)::int AS n FROM ${CHECKIN_ANSWERS_TABLE} WHERE answer LIKE 'probe %'`);
    expect(left.text).toContain('"n":0');
  });
});
