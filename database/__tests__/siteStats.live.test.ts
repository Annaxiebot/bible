/**
 * siteStats.live.test.ts — log_presentation + site_stats against the REAL database · 全站统计真实探针 (ADR-0012)
 *
 * Opt-in (LIVE_DB=1 + token + linked project; skipped otherwise). One DO
 * block, as anon: a valid 900 s call on a saved pack records one row, a
 * second call within 2 hours records none, 300 s and 21601 s are rejected,
 * a made-up pack id is not counted, anon cannot SELECT the table, and
 * site_stats() answers with totals. As an authenticated leader the row
 * carries that leader's id. The block ends in RAISE EXCEPTION, so Postgres
 * rolls everything back — nothing is left in the live table (owner rule:
 * never write test data to live data).
 */
import { describe, it, expect } from 'vitest';
import { LIVE, runSql } from './liveSql';
import { SITE_STATS_KEYS } from '../../components/stats/statsRules';

const PROBE_SQL = `DO $do$ DECLARE
  v_pack text; v_pack2 text; v_leader2 uuid; r1 boolean; r2 boolean; unknown boolean; r3 boolean;
  short_call text := 'accepted'; long_call text := 'accepted'; anon_read text := 'allowed';
  stats jsonb; n_rows int; stored_leader uuid; stored_anon uuid;
BEGIN
  SELECT sp.id INTO v_pack FROM study_packs sp WHERE NOT EXISTS (
    SELECT 1 FROM presentation_sessions p WHERE p.pack_id = sp.id AND p.created_at > now() - interval '2 hours') LIMIT 1;
  SELECT sp.id, sp.leader_id INTO v_pack2, v_leader2 FROM study_packs sp WHERE sp.id <> v_pack AND NOT EXISTS (
    SELECT 1 FROM presentation_sessions p WHERE p.pack_id = sp.id AND p.created_at > now() - interval '2 hours') LIMIT 1;
  IF v_pack IS NULL OR v_pack2 IS NULL THEN RAISE EXCEPTION 'NOPACK'; END IF;
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  r1 := public.log_presentation(v_pack, 900);
  r2 := public.log_presentation(v_pack, 900);
  BEGIN PERFORM public.log_presentation(v_pack2, 300);
  EXCEPTION WHEN invalid_parameter_value THEN short_call := 'rejected'; END;
  BEGIN PERFORM public.log_presentation(v_pack2, 21601);
  EXCEPTION WHEN invalid_parameter_value THEN long_call := 'rejected'; END;
  unknown := public.log_presentation('probe-no-such-pack', 900);
  BEGIN PERFORM count(*) FROM presentation_sessions;
  EXCEPTION WHEN insufficient_privilege THEN anon_read := 'denied'; END;
  stats := public.site_stats();
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_leader2, 'role', 'authenticated')::text, true);
  r3 := public.log_presentation(v_pack2, 1200);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO n_rows FROM presentation_sessions WHERE pack_id = v_pack AND created_at > now() - interval '2 hours';
  SELECT leader_id INTO stored_anon FROM presentation_sessions WHERE pack_id = v_pack ORDER BY created_at DESC LIMIT 1;
  SELECT leader_id INTO stored_leader FROM presentation_sessions WHERE pack_id = v_pack2 ORDER BY created_at DESC LIMIT 1;
  RAISE EXCEPTION 'PROBE:%', jsonb_build_object('r1', r1, 'r2', r2, 'rows', n_rows, 'short', short_call, 'long', long_call,
    'unknown', unknown, 'anon_read', anon_read, 'stats', stats, 'r3', r3,
    'anon_leader_null', stored_anon IS NULL, 'leader_ok', stored_leader = v_leader2);
END $do$;`;

describe.skipIf(!LIVE)('log_presentation / site_stats — live probe (rolled back)', () => {
  it('records one meeting, refuses repeats and bad durations, hides the table from anon', async () => {
    const { text } = await runSql(PROBE_SQL);
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /PROBE:(\{.*\})\s*(?:\n|$)/.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    const got = JSON.parse(match![1]);
    expect(got).toMatchObject({
      r1: true, r2: false, rows: 1, short: 'rejected', long: 'rejected', unknown: false, anon_read: 'denied',
      r3: true, anon_leader_null: true, leader_ok: true,
    });
    for (const key of SITE_STATS_KEYS) expect(Number.isInteger(got.stats[key])).toBe(true);
    // rolled back: no probe row left behind (any real meeting is older than this run or on another pack)
    const left = await runSql(`SELECT count(*)::int AS n FROM presentation_sessions WHERE pack_id = 'probe-no-such-pack'`);
    expect(left.text).toContain('"n":0');
  });
});
