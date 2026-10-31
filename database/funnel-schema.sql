-- Anonymous New-study funnel, owner only · 新建查经匿名漏斗 (ADR-0025)
--
-- Apply AFTER admin-portal-schema.sql (admin_funnel calls its
-- assert_site_admin guard), and BEFORE deploying the site that sends the
-- counts (dashboard SQL editor, or the management API). Additive and
-- idempotent (IF NOT EXISTS, CREATE OR REPLACE), so re-running is safe; the
-- live site before this release never calls these functions.
-- NOT yet applied to the live project.
--
-- What is kept: one row per Los Angeles calendar day × event — a count and,
-- for the three generation outcomes, each counted generation's wait in whole
-- seconds (for the median). Nothing else: no user id, no IP, no token, no
-- pack, no time of day. The browser posts with the public anon key only (no
-- session), so nothing it sends can tie a count to a person or to another
-- count (ADR-0012's privacy rules: aggregates, no identifiers).
--
-- The server decides what counts:
--   * event names from the fixed list below — anything else raises 22023;
--   * a generation outcome (pack_*) must carry its wait, 0..3600 seconds;
--     the other events must carry none (22023 either way);
--   * the day is the server's (a caller cannot back-date a count);
--   * at most 5000 counts per event per day: further calls answer FALSE, so
--     a script cannot grow the table (or the waits array) without bound.
-- Repeats from one browser (a reload of New study, a second tap on a sign-in
-- button within 10 minutes) are dropped by the browser before sending
-- (components/stats/funnel.ts); ADR-0025 says why that is as safe as a
-- server-side token, and simpler.
--
-- Access: nobody reads or writes funnel_daily from a client (RLS on, no
-- policy, privileges revoked). log_funnel_event() is the only writer
-- (anon + authenticated); admin_funnel() the only reader, for site admins.
-- Names, events and limits are pinned to components/stats/funnelRules.ts by
-- database/__tests__/funnelSchema.test.ts.

-- =====================================================
-- FUNNEL_DAILY — one row per LA day × event, counts only
-- =====================================================
CREATE TABLE IF NOT EXISTS funnel_daily (
  day DATE NOT NULL,                       -- America/Los_Angeles calendar day
  event TEXT NOT NULL CHECK (event IN (
    'new_study_opened',
    'signin_started_google', 'signin_started_email',
    'signin_done_google', 'signin_done_email',
    'generate_pressed',
    'pack_ok', 'pack_failed', 'pack_abandoned'
  )),
  count INT NOT NULL DEFAULT 0,
  waits INT[] NOT NULL DEFAULT '{}',       -- seconds, one per counted outcome (pack_* rows only)
  PRIMARY KEY (day, event)
);

ALTER TABLE funnel_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON funnel_daily FROM anon, authenticated;

-- log_funnel_event(p_event, p_wait_seconds) — count one step. TRUE when
-- counted, FALSE when the day's ceiling for that event is reached. The upsert
-- locks the day row, so concurrent calls never lose a count.
CREATE OR REPLACE FUNCTION public.log_funnel_event(p_event TEXT, p_wait_seconds INT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'America/Los_Angeles')::date;
  v_outcome BOOLEAN := p_event IN ('pack_ok', 'pack_failed', 'pack_abandoned');
BEGIN
  IF p_event IS NULL OR p_event NOT IN (
    'new_study_opened',
    'signin_started_google', 'signin_started_email',
    'signin_done_google', 'signin_done_email',
    'generate_pressed',
    'pack_ok', 'pack_failed', 'pack_abandoned'
  ) THEN
    RAISE EXCEPTION 'unknown funnel event %', p_event USING ERRCODE = '22023';
  END IF;
  IF v_outcome AND (p_wait_seconds IS NULL OR p_wait_seconds < 0 OR p_wait_seconds > 3600) THEN
    RAISE EXCEPTION 'wait % out of range 0..3600', p_wait_seconds USING ERRCODE = '22023';
  END IF;
  IF NOT v_outcome AND p_wait_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'event % takes no wait', p_event USING ERRCODE = '22023';
  END IF;

  INSERT INTO funnel_daily AS f (day, event, count, waits)
  VALUES (v_day, p_event, 1, CASE WHEN v_outcome THEN ARRAY[p_wait_seconds] ELSE '{}'::INT[] END)
  ON CONFLICT (day, event) DO UPDATE
    SET count = f.count + 1, waits = f.waits || EXCLUDED.waits
    WHERE f.count < 5000;
  RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.log_funnel_event(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_funnel_event(TEXT, INT) TO anon, authenticated;

-- admin_funnel(p_days) — the last p_days LA days (1..92), site admins only.
-- One row per day × event (count, median wait of that day's outcomes), then
-- one row per event with day NULL: the whole window's count and median.
-- median_wait_seconds is NULL for events without waits.
CREATE OR REPLACE FUNCTION public.admin_funnel(p_days INT)
RETURNS TABLE (day DATE, event TEXT, count INT, median_wait_seconds INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_since DATE;
BEGIN
  PERFORM public.assert_site_admin();
  IF p_days IS NULL OR p_days < 1 OR p_days > 92 THEN
    RAISE EXCEPTION 'days % out of range 1..92', p_days USING ERRCODE = '22023';
  END IF;
  v_since := (now() AT TIME ZONE 'America/Los_Angeles')::date - (p_days - 1);
  RETURN QUERY
  SELECT f.day, f.event, f.count,
    (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY u.w))::INT FROM unnest(f.waits) AS u(w))
  FROM funnel_daily f
  WHERE f.day >= v_since
  UNION ALL
  SELECT NULL::DATE, f.event, sum(f.count)::INT,
    (SELECT round(percentile_cont(0.5) WITHIN GROUP (ORDER BY u.w))::INT
       FROM funnel_daily g CROSS JOIN LATERAL unnest(g.waits) AS u(w)
      WHERE g.event = f.event AND g.day >= v_since)
  FROM funnel_daily f
  WHERE f.day >= v_since
  GROUP BY f.event
  ORDER BY 1 DESC NULLS FIRST, 2;
END $$;
REVOKE ALL ON FUNCTION public.admin_funnel(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_funnel(INT) TO authenticated;
