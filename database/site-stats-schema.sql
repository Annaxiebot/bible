-- Site-wide usage counters · 全站使用统计 (ADR-0012)
--
-- Apply AFTER signups-schema.sql, signup-practices-schema.sql,
-- signup-replace-schema.sql and study-packs-schema.sql (dashboard SQL editor,
-- or the management API). Idempotent (IF NOT EXISTS, CREATE OR REPLACE), so
-- re-running is safe. Applied to the live project through the management API
-- on 2026-10-06.
--
-- Aggregates only, never names (ADR-0003 §17): site_stats() returns site-wide
-- totals and nothing per pack or per leader. The keys are pinned by
-- database/__tests__/siteStatsSchema.test.ts and equal SITE_STATS_KEYS in
-- components/stats/siteStats.ts.

-- =====================================================
-- PRESENTATION_SESSIONS — one row per study meeting (TV presentation ≥ 10 min)
-- =====================================================
-- The only writer is log_presentation() below. Nobody reads through the API:
-- RLS on with no policy, and anon/authenticated privileges revoked.
CREATE TABLE IF NOT EXISTS presentation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id TEXT NOT NULL,
  leader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,  -- the signed-in presenter, else NULL
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,                     -- unknown: logged while the meeting is still going
  duration_seconds INTEGER,                 -- visible seconds when logged (600 .. 21600)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The rate-limit lookup: rows for one pack in the last 2 hours.
CREATE INDEX IF NOT EXISTS idx_presentation_sessions_pack_created ON presentation_sessions (pack_id, created_at DESC);

ALTER TABLE presentation_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON presentation_sessions FROM anon, authenticated;

-- log_presentation(p_pack_id, p_seconds) — the TV view calls it once, after
-- 10 minutes of visible presentation time. Returns TRUE when a row was
-- recorded, FALSE when the call was valid but not counted:
--   * the pack is not a saved leader pack (not in study_packs) — the demo
--     pack, local-only packs and made-up ids never count;
--   * the pack already has a row from the last 2 hours (reloads, a second
--     TV in the same room).
-- Out-of-range seconds raise 22023. An advisory lock per pack makes the
-- check-then-insert atomic. leader_id comes from auth.uid(), never the caller.
CREATE OR REPLACE FUNCTION public.log_presentation(p_pack_id TEXT, p_seconds INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_seconds IS NULL OR p_seconds < 600 OR p_seconds > 21600 THEN
    RAISE EXCEPTION 'seconds % out of range 600..21600', p_seconds USING ERRCODE = '22023';
  END IF;
  IF p_pack_id IS NULL OR NOT EXISTS (SELECT 1 FROM study_packs WHERE id = p_pack_id) THEN
    RETURN FALSE;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('log_presentation:' || p_pack_id));
  IF EXISTS (
    SELECT 1 FROM presentation_sessions
    WHERE pack_id = p_pack_id AND created_at > now() - interval '2 hours'
  ) THEN
    RETURN FALSE;
  END IF;
  INSERT INTO presentation_sessions (pack_id, leader_id, started_at, duration_seconds)
    VALUES (p_pack_id, auth.uid(), now() - make_interval(secs => p_seconds), p_seconds);
  RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.log_presentation(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_presentation(TEXT, INTEGER) TO anon, authenticated;

-- site_stats() — site-wide totals, no identities, no breakdowns.
--   packs           study_packs rows (leader packs saved to the account)
--   leaders         distinct leaders with at least one pack (≈ groups)
--   meetings        presentation_sessions rows
--   signups         live study_signups (replaced_at IS NULL)
--   practices       practices chosen on live sign-ups: the practices array
--                   length; older rows count their legacy columns, else 1
--   checkins_shared checkin_answers rows
--   as_of           when the totals were read
CREATE OR REPLACE FUNCTION public.site_stats()
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'packs', (SELECT count(*) FROM study_packs),
    'leaders', (SELECT count(DISTINCT leader_id) FROM study_packs),
    'meetings', (SELECT count(*) FROM presentation_sessions),
    'signups', (SELECT count(*) FROM study_signups WHERE replaced_at IS NULL),
    'practices', (
      SELECT coalesce(sum(
        CASE
          WHEN jsonb_typeof(s.practices) = 'array' AND jsonb_array_length(s.practices) > 0
            THEN jsonb_array_length(s.practices)
          ELSE greatest(1, (s.practice_text IS NOT NULL)::int + (s.practice2_text IS NOT NULL)::int)
        END), 0)
      FROM study_signups s WHERE s.replaced_at IS NULL),
    'checkins_shared', (SELECT count(*) FROM checkin_answers),
    'as_of', now()
  );
$$;
REVOKE ALL ON FUNCTION public.site_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_stats() TO anon, authenticated;
