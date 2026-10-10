/**
 * askAiHistory.live.test.ts — ask_ai_history + save_ask_ai_exchange against the REAL database · 问一问记录真实探针 (ADR-0021)
 *
 * Opt-in (LIVE_DB=1 + token + linked project; skipped otherwise). Run it
 * only AFTER database/ask-ai-history-schema.sql is applied (release step 3).
 * One DO block on a study that has no saved history yet:
 *   - the owner saves, reads and deletes their own row; a direct INSERT is
 *     refused (the RPC is the only writer);
 *   - another signed-in user sees nothing, cannot save on the pack and
 *     deletes nothing; anon can neither read nor call the RPC;
 *   - at 20 rows the 21st is refused (AH020) without the replace path;
 *     with it, 20 stay and the oldest goes, the permission is stored, and
 *     the next save replaces without asking.
 * The block ends in RAISE EXCEPTION, so Postgres rolls everything back —
 * nothing is left in the live tables (owner rule: never write test data to
 * live data).
 */
import { describe, it, expect } from 'vitest';
import { LIVE, runSql } from './liveSql';
import { ASK_HISTORY_LIMIT, ASK_HISTORY_FULL_CODE } from '../../components/studypack/askHistoryRules';

const SEEDED = ASK_HISTORY_LIMIT - 1;

const PROBE_SQL = `DO $do$ DECLARE
  v_pack text; v_owner uuid; v_other uuid := gen_random_uuid();
  r_first text; r_full text := 'accepted'; r_replace text; r_next text;
  owner_sees int; other_sees int; other_save text := 'accepted'; other_deleted int;
  anon_read text := 'allowed'; anon_rpc text := 'allowed'; direct_insert text := 'allowed';
  n_full int; n_replaced int; oldest_gone boolean; second_gone boolean; allowed boolean; n_after_delete int; first_id uuid;
BEGIN
  SELECT sp.id, sp.leader_id INTO v_pack, v_owner FROM study_packs sp
    WHERE NOT EXISTS (SELECT 1 FROM ask_ai_history h WHERE h.pack_id = sp.id) LIMIT 1;
  IF v_pack IS NULL THEN RAISE EXCEPTION 'NOPACK'; END IF;
  UPDATE study_packs SET ask_ai_replace_oldest = FALSE WHERE id = v_pack;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  r_first := public.save_ask_ai_exchange(v_pack, 'probe-first', 'probe answer', 'probe/model', false);
  SELECT count(*) INTO owner_sees FROM ask_ai_history WHERE pack_id = v_pack;
  BEGIN INSERT INTO ask_ai_history (leader_id, pack_id, question, answer) VALUES (v_owner, v_pack, 'probe-direct', 'x');
  EXCEPTION WHEN insufficient_privilege THEN direct_insert := 'denied'; END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO other_sees FROM ask_ai_history WHERE pack_id = v_pack;
  BEGIN PERFORM public.save_ask_ai_exchange(v_pack, 'probe-other', 'x', NULL, true);
  EXCEPTION WHEN insufficient_privilege THEN other_save := 'refused'; END;
  WITH d AS (DELETE FROM ask_ai_history WHERE pack_id = v_pack RETURNING 1) SELECT count(*) INTO other_deleted FROM d;
  EXECUTE 'RESET ROLE';

  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  BEGIN PERFORM count(*) FROM ask_ai_history;
  EXCEPTION WHEN insufficient_privilege THEN anon_read := 'denied'; END;
  BEGIN PERFORM public.save_ask_ai_exchange(v_pack, 'probe-anon', 'x', NULL, true);
  EXCEPTION WHEN insufficient_privilege THEN anon_rpc := 'denied'; END;
  EXECUTE 'RESET ROLE';

  INSERT INTO ask_ai_history (leader_id, pack_id, question, answer, created_at)
    SELECT v_owner, v_pack, 'probe-seed-' || i, 'seed', now() - interval '1 hour' - make_interval(mins => i)
    FROM generate_series(1, ${SEEDED}) AS i;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN PERFORM public.save_ask_ai_exchange(v_pack, 'probe-21st', 'x', NULL, false);
  EXCEPTION WHEN SQLSTATE '${ASK_HISTORY_FULL_CODE}' THEN r_full := 'full'; END;
  SELECT count(*) INTO n_full FROM ask_ai_history WHERE pack_id = v_pack;
  r_replace := public.save_ask_ai_exchange(v_pack, 'probe-replace', 'x', NULL, true);
  SELECT count(*) INTO n_replaced FROM ask_ai_history WHERE pack_id = v_pack;
  SELECT NOT EXISTS (SELECT 1 FROM ask_ai_history WHERE pack_id = v_pack AND question = 'probe-seed-${SEEDED}') INTO oldest_gone;
  r_next := public.save_ask_ai_exchange(v_pack, 'probe-next', 'x', NULL, false);
  SELECT NOT EXISTS (SELECT 1 FROM ask_ai_history WHERE pack_id = v_pack AND question = 'probe-seed-${SEEDED - 1}') INTO second_gone;
  SELECT id INTO first_id FROM ask_ai_history WHERE pack_id = v_pack AND question = 'probe-first';
  DELETE FROM ask_ai_history WHERE id = first_id;
  SELECT count(*) INTO n_after_delete FROM ask_ai_history WHERE pack_id = v_pack;
  EXECUTE 'RESET ROLE';
  SELECT ask_ai_replace_oldest INTO allowed FROM study_packs WHERE id = v_pack;

  RAISE EXCEPTION 'PROBE:%', jsonb_build_object('first', r_first, 'owner_sees', owner_sees, 'direct_insert', direct_insert,
    'other_sees', other_sees, 'other_save', other_save, 'other_deleted', other_deleted, 'anon_read', anon_read, 'anon_rpc', anon_rpc,
    'full', r_full, 'n_full', n_full, 'replace', r_replace, 'n_replaced', n_replaced, 'oldest_gone', oldest_gone,
    'next', r_next, 'second_gone', second_gone, 'allowed', allowed, 'n_after_delete', n_after_delete);
END $do$;`;

describe.skipIf(!LIVE)('ask_ai_history / save_ask_ai_exchange — live probe (rolled back)', () => {
  it('owner-only, RPC the only writer, 20 per study, replace drops the oldest', async () => {
    const { text } = await runSql(PROBE_SQL);
    const message = String((JSON.parse(text) as { message?: string }).message ?? '');
    const match = /PROBE:(\{.*\})\s*(?:\n|$)/.exec(message);
    expect(match, message.slice(0, 300)).not.toBeNull();
    expect(JSON.parse(match![1])).toEqual({
      first: 'saved', owner_sees: 1, direct_insert: 'denied',
      other_sees: 0, other_save: 'refused', other_deleted: 0, anon_read: 'denied', anon_rpc: 'denied',
      full: 'full', n_full: ASK_HISTORY_LIMIT, replace: 'replaced', n_replaced: ASK_HISTORY_LIMIT, oldest_gone: true,
      next: 'replaced', second_gone: true, allowed: true, n_after_delete: ASK_HISTORY_LIMIT - 1,
    });
    // rolled back: no probe row left behind
    const left = await runSql(`SELECT count(*)::int AS n FROM ask_ai_history WHERE question LIKE 'probe-%'`);
    expect(left.text).toContain('"n":0');
  });
});
