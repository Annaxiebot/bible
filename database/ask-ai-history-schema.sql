-- Ask AI history, per study, for the leader only · 问一问记录 (ADR-0021)
--
-- Apply AFTER study-packs-schema.sql (dashboard SQL editor, or the
-- management API). Idempotent (IF NOT EXISTS, DROP POLICY IF EXISTS,
-- CREATE OR REPLACE), so re-running is safe. NOT yet applied to the live
-- project.
--
-- What lives here: each completed Ask AI exchange (question, answer, the
-- model that answered, the time) on a study the signed-in leader owns. At
-- most 20 per study (ASK_HISTORY_LIMIT in components/studypack/askHistory.ts;
-- the numbers below are pinned to it by
-- database/__tests__/askAiHistorySchema.test.ts).
--
-- Access: the leader reads and deletes only their own rows; anon nothing.
-- The ONLY writer is save_ask_ai_exchange() below (SECURITY DEFINER):
-- INSERT/UPDATE are revoked from authenticated, so no client can grow a
-- study's history past the limit or write a row for someone else's pack.
-- An RPC rather than a trigger: the limit needs a choice the caller makes
-- (replace the oldest, or refuse) and a distinct refusal the client maps to
-- the "20 saved" notice; a trigger can only refuse, and a delete-then-insert
-- from the client would be two round trips with a race between them.
--
-- Cascades: pack_id references study_packs(id) ON DELETE CASCADE (deleting
-- the study deletes its history), leader_id references auth.users ON DELETE
-- CASCADE (deleting the account deletes it). A pack that exists only in one
-- browser (never synced) has no study_packs row, so nothing is saved for it
-- until it syncs; the RPC refuses it and the panel says so.

-- =====================================================
-- The per-study permission: "Replace oldest" (ADR-0021)
-- =====================================================
-- Stored with the study so it holds on every device the leader uses.
-- packSync's upsert sends only id/leader_id/title/pack, and PostgREST's
-- upsert updates only the columns it sends, so a pack save never resets it.
-- The leader turns it on from the TV notice (save_ask_ai_exchange with
-- p_replace_oldest = true) and off from #/leader/<id> (an UPDATE under the
-- existing owner-only policy on study_packs).
ALTER TABLE study_packs ADD COLUMN IF NOT EXISTS ask_ai_replace_oldest BOOLEAN NOT NULL DEFAULT FALSE;

-- =====================================================
-- ASK_AI_HISTORY — one row per saved exchange
-- =====================================================
CREATE TABLE IF NOT EXISTS ask_ai_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pack_id TEXT NOT NULL REFERENCES study_packs(id) ON DELETE CASCADE,
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 1 AND 10000),
  answer TEXT NOT NULL CHECK (char_length(answer) BETWEEN 1 AND 50000),
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ask_ai_history_leader_pack_created ON ask_ai_history (leader_id, pack_id, created_at);

ALTER TABLE ask_ai_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ask_ai_history FROM anon, authenticated;
GRANT SELECT, DELETE ON ask_ai_history TO authenticated;

DROP POLICY IF EXISTS "Leaders can view their own Ask AI history" ON ask_ai_history;
CREATE POLICY "Leaders can view their own Ask AI history"
  ON ask_ai_history FOR SELECT
  TO authenticated
  USING (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can delete their own Ask AI history" ON ask_ai_history;
CREATE POLICY "Leaders can delete their own Ask AI history"
  ON ask_ai_history FOR DELETE
  TO authenticated
  USING (auth.uid() = leader_id);

-- Defence in depth: INSERT is revoked above, but should a grant ever come
-- back, a row still needs the caller's own uid and the caller's own pack.
DROP POLICY IF EXISTS "Leaders can insert Ask AI history for their own packs" ON ask_ai_history;
CREATE POLICY "Leaders can insert Ask AI history for their own packs"
  ON ask_ai_history FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = leader_id
    AND EXISTS (SELECT 1 FROM study_packs sp WHERE sp.id = pack_id AND sp.leader_id = auth.uid())
  );

-- Nothing for anon, on purpose.

-- save_ask_ai_exchange(...) — the one writer. Saves one exchange for the
-- caller (auth.uid(), never a parameter) on a pack the caller owns.
--   * fewer than 20 rows for the pack: insert, return 'saved';
--   * 20 already, and p_replace_oldest OR the pack's stored permission:
--     delete the oldest (down to 19), insert, return 'replaced';
--     p_replace_oldest = true also stores the permission on the pack;
--   * 20 already, no permission: raise SQLSTATE AH020 (the client's
--     "20 saved" notice), nothing written.
-- Not signed in, or not the caller's pack (or a pack never synced): 42501.
-- Empty or over-long text: 22023. The pack row is locked FOR UPDATE, so two
-- saves for one study cannot both pass the count.
CREATE OR REPLACE FUNCTION public.save_ask_ai_exchange(
  p_pack_id TEXT, p_question TEXT, p_answer TEXT, p_model TEXT, p_replace_oldest BOOLEAN
) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_allowed BOOLEAN;
  v_count INTEGER;
  v_replaced BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to save Ask AI history' USING ERRCODE = '42501';
  END IF;
  IF char_length(coalesce(p_question, '')) NOT BETWEEN 1 AND 10000
     OR char_length(coalesce(p_answer, '')) NOT BETWEEN 1 AND 50000 THEN
    RAISE EXCEPTION 'question or answer empty or too long' USING ERRCODE = '22023';
  END IF;
  SELECT ask_ai_replace_oldest INTO v_allowed
    FROM study_packs WHERE id = p_pack_id AND leader_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'study % is not yours or not synced', p_pack_id USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_count FROM ask_ai_history WHERE pack_id = p_pack_id AND leader_id = v_uid;
  IF v_count >= 20 THEN
    IF NOT (coalesce(p_replace_oldest, FALSE) OR v_allowed) THEN
      RAISE EXCEPTION 'ask_ai_history_full' USING ERRCODE = 'AH020';
    END IF;
    DELETE FROM ask_ai_history WHERE id IN (
      SELECT id FROM ask_ai_history WHERE pack_id = p_pack_id AND leader_id = v_uid
      ORDER BY created_at, id LIMIT v_count - 20 + 1
    );
    v_replaced := TRUE;
  END IF;
  IF coalesce(p_replace_oldest, FALSE) AND NOT v_allowed THEN
    UPDATE study_packs SET ask_ai_replace_oldest = TRUE WHERE id = p_pack_id AND leader_id = v_uid;
  END IF;
  INSERT INTO ask_ai_history (leader_id, pack_id, question, answer, model)
    VALUES (v_uid, p_pack_id, p_question, p_answer, p_model);
  RETURN CASE WHEN v_replaced THEN 'replaced' ELSE 'saved' END;
END $$;
REVOKE ALL ON FUNCTION public.save_ask_ai_exchange(TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_ask_ai_exchange(TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
