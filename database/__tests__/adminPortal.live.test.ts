/**
 * adminPortal.live.test.ts — the admin functions against the REAL database · 管理后台真实探针 (ADR-0023)
 *
 * Opt-in (LIVE_DB=1 + token + linked project; skipped otherwise). Run it
 * only AFTER database/admin-portal-schema.sql is applied (release step 3).
 * One DO block, read-only calls:
 *   - as the owner (looked up by email; must already be in site_admins via
 *     the file's owner insert): is_site_admin() is true and admin_leaders(),
 *     admin_feedback(), admin_stats() all answer; site_admins itself is
 *     still not selectable;
 *   - as another existing account (not an admin): is_site_admin() is false
 *     and every admin_* raises AD403; site_admins not selectable;
 *   - as anon: no EXECUTE on any of them, site_admins not selectable.
 * The block ends in RAISE EXCEPTION, so Postgres rolls everything back
 * (nothing is written anyway; owner rule: never write test data to live).
 */
import { describe, it, expect } from 'vitest';
import { LIVE, runSql } from './liveSql';
import {
  IS_SITE_ADMIN_FN, ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN, ADMIN_DENIED_CODE, ADMIN_EXTRA_STATS_KEYS,
} from '../../components/admin/adminRules';
import { SITE_STATS_KEYS } from '../../components/stats/statsRules';

const OWNER_EMAIL = 'csheargm@gmail.com';
const ADMIN_FNS = [ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN];

/** For each admin function: PERFORM it, record 'ok', the refusal code, or 'denied' (no EXECUTE). */
const tryEach = (who: string) => ADMIN_FNS.map(fn => `
  BEGIN PERFORM public.${fn}(); res := res || jsonb_build_object('${who}_${fn}', 'ok');
  EXCEPTION WHEN SQLSTATE '${ADMIN_DENIED_CODE}' THEN res := res || jsonb_build_object('${who}_${fn}', '${ADMIN_DENIED_CODE}');
    WHEN insufficient_privilege THEN res := res || jsonb_build_object('${who}_${fn}', 'denied'); END;`).join('');

const tryTable = (who: string) => `
  BEGIN PERFORM count(*) FROM site_admins; res := res || jsonb_build_object('${who}_table', 'readable');
  EXCEPTION WHEN insufficient_privilege THEN res := res || jsonb_build_object('${who}_table', 'denied'); END;`;

const PROBE_SQL = `DO $do$ DECLARE
  v_owner uuid; v_other uuid; res jsonb := '{}'; n_leaders int; owner_listed boolean; stats jsonb;
BEGIN
  SELECT id INTO v_owner FROM auth.users WHERE email = '${OWNER_EMAIL}';
  SELECT u.id INTO v_other FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM site_admins a WHERE a.user_id = u.id) LIMIT 1;
  IF v_owner IS NULL OR v_other IS NULL THEN RAISE EXCEPTION 'NOUSER'; END IF;
  res := res || jsonb_build_object('owner_in_table', EXISTS (SELECT 1 FROM site_admins WHERE user_id = v_owner));

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  res := res || jsonb_build_object('owner_is_admin', public.${IS_SITE_ADMIN_FN}());
  ${tryEach('owner')}
  SELECT count(*), bool_or(email = '${OWNER_EMAIL}') INTO n_leaders, owner_listed FROM public.${ADMIN_LEADERS_FN}();
  stats := public.${ADMIN_STATS_FN}();
  ${tryTable('owner')}

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  res := res || jsonb_build_object('other_is_admin', public.${IS_SITE_ADMIN_FN}());
  ${tryEach('other')}
  ${tryTable('other')}
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  BEGIN PERFORM public.${IS_SITE_ADMIN_FN}(); res := res || jsonb_build_object('anon_check', 'ok');
  EXCEPTION WHEN insufficient_privilege THEN res := res || jsonb_build_object('anon_check', 'denied'); END;
  ${tryEach('anon')}
  ${tryTable('anon')}
  EXECUTE 'RESET ROLE';

  RAISE EXCEPTION 'PROBE:%', res || jsonb_build_object('n_leaders', n_leaders, 'owner_listed', owner_listed, 'stats', stats);
END $do$;`;

describe.skipIf(!LIVE)('admin portal — live probe (rolled back)', () => {
  it('the owner reads every admin function; another leader gets AD403; anon has no access; site_admins unreadable', async () => {
    const { text } = await runSql(PROBE_SQL);
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /PROBE:(\{.*\})\s*(?:\n|$)/.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    const got = JSON.parse(match![1]);
    const each = (who: string, value: string) => Object.fromEntries(ADMIN_FNS.map(fn => [`${who}_${fn}`, value]));
    expect(got).toMatchObject({
      owner_in_table: true, owner_is_admin: true, ...each('owner', 'ok'), owner_table: 'denied', owner_listed: true,
      other_is_admin: false, ...each('other', ADMIN_DENIED_CODE), other_table: 'denied',
      anon_check: 'denied', ...each('anon', 'denied'), anon_table: 'denied',
    });
    expect(got.n_leaders).toBeGreaterThanOrEqual(2);
    for (const key of [...SITE_STATS_KEYS, ...ADMIN_EXTRA_STATS_KEYS]) expect(Number.isInteger(got.stats[key])).toBe(true);
  });
});
