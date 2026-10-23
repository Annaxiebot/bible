-- Hosted AI: a site-wide daily cap on pack generations · 本站AI每日生成总上限
-- (ADR-0007 "Caps", 2026-10-23)
--
-- Apply AFTER ai-usage-schema.sql and BEFORE deploying the ai-proxy that
-- calls consume_ai_quota_daily: Supabase dashboard → SQL editor → paste this
-- file → Run. Additive and idempotent (IF NOT EXISTS / CREATE OR REPLACE):
-- the live ai-proxy keeps calling consume_ai_quota, which is unchanged, so
-- applying this early breaks nothing.
--
-- What lives here: one counter per UTC day per AI role (only 'pack' is
-- capped today; the cap comes from the secret AI_DAILY_PACK_CAP, default
-- 30, passed in by the function). Counts only — no user id, no content.
--
-- Access: nobody reads or writes from a client (RLS on, no policy, privileges
-- revoked). The only writer is consume_ai_quota_daily(), SECURITY DEFINER,
-- executable by service_role alone (the Edge Function's service client).

-- =====================================================
-- AI_SITE_DAILY — one row per UTC day × role
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_site_daily (
  day DATE NOT NULL,                                           -- UTC day
  role TEXT NOT NULL CHECK (role IN ('ask', 'pack', 'adjust', 'sharing', 'study', 'pick')),
  count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, role)
);

ALTER TABLE ai_site_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_site_daily FROM anon, authenticated;

-- =====================================================
-- consume_ai_quota_daily — the leader's month and the site's day, together
-- =====================================================
-- Returns the leader's new monthly count; -1 when the leader's month is full
-- (consume_ai_quota's own answer); -2 when the site's day is full. The day
-- row is locked FOR UPDATE before the monthly count, so two concurrent calls
-- cannot both take the last daily slot, and a refused call spends neither
-- counter (one transaction). p_daily_limit NULL = the role has no daily cap.
CREATE OR REPLACE FUNCTION public.consume_ai_quota_daily(p_leader UUID, p_role TEXT, p_limit INT, p_daily_limit INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day DATE := timezone('UTC', now())::date;
  v_site INT;
  v_count INT;
BEGIN
  IF p_daily_limit IS NULL THEN
    RETURN public.consume_ai_quota(p_leader, p_role, p_limit);
  END IF;

  INSERT INTO ai_site_daily (day, role) VALUES (v_day, p_role)
  ON CONFLICT (day, role) DO NOTHING;
  SELECT count INTO v_site FROM ai_site_daily WHERE day = v_day AND role = p_role FOR UPDATE;
  IF v_site >= p_daily_limit THEN
    RETURN -2;
  END IF;

  v_count := public.consume_ai_quota(p_leader, p_role, p_limit);
  IF v_count < 0 THEN
    RETURN v_count;
  END IF;

  UPDATE ai_site_daily SET count = count + 1, updated_at = now()
   WHERE day = v_day AND role = p_role;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota_daily(UUID, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota_daily(UUID, TEXT, INT, INT) TO service_role;
