/**
 * funnel.live.test.ts — the funnel functions against the REAL database · 漏斗真实探针 (ADR-0025)
 *
 * Opt-in (LIVE_DB=1 + token + linked project; skipped otherwise). Run it
 * only AFTER database/funnel-schema.sql is applied (ADR-0025 "Release" 1).
 * One DO block:
 *   - as anon: a page-open and an outcome with its wait are counted; an
 *     unknown event, an outcome without a wait or over the limit, and a wait
 *     on a page-open are rejected (22023); the day's ceiling stops counting
 *     at FUNNEL_DAILY_CEILING; the table is not selectable; admin_funnel is
 *     not executable;
 *   - as a signed-in non-admin: admin_funnel raises AD403;
 *   - as a site admin: admin_funnel(14) answers, today's page-open is in
 *     admin_funnel(1), and a window over FUNNEL_MAX_DAYS is rejected.
 * The block ends in RAISE EXCEPTION, so Postgres rolls everything back —
 * no probe count is left in the live table (owner rule: never write test
 * data to live data).
 */
import { describe, it, expect } from 'vitest';
import { LIVE, runSql } from './liveSql';
import {
  LOG_FUNNEL_FN, ADMIN_FUNNEL_FN, FUNNEL_DAILY_CEILING, FUNNEL_MAX_WAIT_SECONDS, FUNNEL_MAX_DAYS, FUNNEL_DAYS,
} from '../../components/stats/funnelRules';
import { ADMIN_DENIED_CODE } from '../../components/admin/adminRules';
import { CHECKIN_TIMEZONE } from '../../supabase/functions/send-checkins/templates';

/** PERFORM one call; record 'accepted' or 'rejected' (22023). */
const tryLog = (name: string, args: string) => `
  BEGIN PERFORM public.${LOG_FUNNEL_FN}(${args}); res := res || jsonb_build_object('${name}', 'accepted');
  EXCEPTION WHEN invalid_parameter_value THEN res := res || jsonb_build_object('${name}', 'rejected'); END;`;

const PROBE_SQL = `DO $do$ DECLARE
  v_owner uuid; v_other uuid; res jsonb := '{}'; n int := 0; v_ceiling int; rows_owner int; today_opened int;
  v_day date := (now() AT TIME ZONE '${CHECKIN_TIMEZONE}')::date;
BEGIN
  SELECT user_id INTO v_owner FROM site_admins LIMIT 1;
  SELECT u.id INTO v_other FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM site_admins a WHERE a.user_id = u.id) LIMIT 1;
  IF v_owner IS NULL OR v_other IS NULL THEN RAISE EXCEPTION 'NOUSER'; END IF;

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  res := res || jsonb_build_object('opened', public.${LOG_FUNNEL_FN}('new_study_opened', NULL));
  res := res || jsonb_build_object('ok', public.${LOG_FUNNEL_FN}('pack_ok', 42));
  ${tryLog('unknown', "'no_such_event', NULL")}
  ${tryLog('ok_no_wait', "'pack_ok', NULL")}
  ${tryLog('ok_long_wait', `'pack_ok', ${FUNNEL_MAX_WAIT_SECONDS + 1}`)}
  ${tryLog('opened_with_wait', "'new_study_opened', 5")}
  FOR i IN 1..${FUNNEL_DAILY_CEILING + 1} LOOP
    EXIT WHEN NOT public.${LOG_FUNNEL_FN}('signin_done_email', NULL);
    n := n + 1;
  END LOOP;
  BEGIN PERFORM count(*) FROM funnel_daily; res := res || jsonb_build_object('anon_table', 'readable');
  EXCEPTION WHEN insufficient_privilege THEN res := res || jsonb_build_object('anon_table', 'denied'); END;
  BEGIN PERFORM public.${ADMIN_FUNNEL_FN}(${FUNNEL_DAYS}); res := res || jsonb_build_object('anon_admin', 'ok');
  EXCEPTION WHEN insufficient_privilege THEN res := res || jsonb_build_object('anon_admin', 'denied'); END;
  EXECUTE 'RESET ROLE';
  SELECT count INTO v_ceiling FROM funnel_daily WHERE day = v_day AND event = 'signin_done_email';

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.${ADMIN_FUNNEL_FN}(${FUNNEL_DAYS}); res := res || jsonb_build_object('other_admin', 'ok');
  EXCEPTION WHEN SQLSTATE '${ADMIN_DENIED_CODE}' THEN res := res || jsonb_build_object('other_admin', '${ADMIN_DENIED_CODE}'); END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO rows_owner FROM public.${ADMIN_FUNNEL_FN}(${FUNNEL_DAYS});
  SELECT f.count INTO today_opened FROM public.${ADMIN_FUNNEL_FN}(1) f WHERE f.day IS NOT NULL AND f.event = 'new_study_opened';
  BEGIN PERFORM public.${ADMIN_FUNNEL_FN}(${FUNNEL_MAX_DAYS + 1}); res := res || jsonb_build_object('owner_too_long', 'ok');
  EXCEPTION WHEN invalid_parameter_value THEN res := res || jsonb_build_object('owner_too_long', 'rejected'); END;
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'PROBE:%', res || jsonb_build_object('ceiling', v_ceiling, 'rows_owner', rows_owner, 'today_opened', today_opened);
END $do$;`;

describe.skipIf(!LIVE)('anonymous funnel — live probe (rolled back)', () => {
  it('anon counts valid steps only, up to the ceiling, and cannot read; a leader gets AD403; an admin reads', async () => {
    const { text } = await runSql(PROBE_SQL);
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /PROBE:(\{.*\})\s*(?:\n|$)/.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    const got = JSON.parse(match![1]);
    expect(got).toMatchObject({
      opened: true, ok: true, unknown: 'rejected', ok_no_wait: 'rejected', ok_long_wait: 'rejected', opened_with_wait: 'rejected',
      ceiling: FUNNEL_DAILY_CEILING, anon_table: 'denied', anon_admin: 'denied',
      other_admin: ADMIN_DENIED_CODE, owner_too_long: 'rejected',
    });
    expect(got.rows_owner).toBeGreaterThanOrEqual(2);   // today's day rows + the window rows
    expect(got.today_opened).toBeGreaterThanOrEqual(1);
    // rolled back: nothing of the probe is left (the table exists only after the SQL is applied)
    const left = await runSql(`SELECT count(*)::int AS n FROM funnel_daily WHERE count >= ${FUNNEL_DAILY_CEILING}`);
    expect(left.text).toContain('"n":0');
  });
});
