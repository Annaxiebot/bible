-- Site admin portal, owner only · 管理后台 (ADR-0023)
--
-- Apply AFTER supabase-schema.sql, ai-usage-schema.sql, feedback-schema.sql,
-- signups-schema.sql, signup-replace-schema.sql, study-packs-schema.sql and
-- site-stats-schema.sql (dashboard SQL editor, or the management API).
-- Idempotent (IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING), so
-- re-running is safe. NOT yet applied to the live project.
--
-- Admin status is decided HERE, never by an email check in the browser:
-- every admin read is a SECURITY DEFINER function that first checks that
-- auth.uid() is in site_admins and otherwise raises AD403
-- (ADMIN_DENIED_CODE in components/admin/adminRules.ts). site_admins itself
-- is unreadable by anon/authenticated; the browser may only ask
-- is_site_admin() → boolean for itself (to show the leader-home link).
-- Read-only v1: no function here writes anything. Names, keys and the error
-- code are pinned by database/__tests__/adminPortalSchema.test.ts.
--
-- "This month":
--   * Ask AI uses this month = the ai_usage 'ask' row of the CURRENT QUOTA
--     MONTH. ai_usage counts per UTC calendar month (month = 'YYYY-MM', the
--     same key consume_ai_quota writes), so a Los Angeles calendar month
--     cannot be cut out of it; the figure is the one the leader's own quota
--     shows. (Off by at most the 7–8 evening hours of an LA month's last day.)
--   * Active leaders this month (admin_stats) = distinct accounts that, since
--     the start of the current calendar month in America/Los_Angeles (the
--     check-in timezone), signed in (auth.users.last_sign_in_at), saved a
--     study (study_packs.updated_at), or used the site's AI
--     (ai_usage.updated_at with count > 0). last_sign_in_at alone undercounts:
--     a leader whose session keeps refreshing never signs in again.

-- =====================================================
-- SITE_ADMINS — who is an admin (no UI adds one; a deliberate SQL step)
-- =====================================================
CREATE TABLE IF NOT EXISTS site_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS on with no policy, and every client privilege revoked (belt and braces).
ALTER TABLE site_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON site_admins FROM anon, authenticated;

-- is_site_admin() — is the CALLER an admin? Only ever about auth.uid(); never
-- takes a user id, so it cannot be used to probe other accounts.
CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_site_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;

-- assert_site_admin() — the one guard every admin_* function calls first.
-- Not callable by any client role (only from inside the definer functions).
CREATE OR REPLACE FUNCTION public.assert_site_admin()
RETURNS VOID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'site admins only' USING ERRCODE = 'AD403';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_site_admin() FROM PUBLIC, anon, authenticated;

-- admin_leaders() — one row per account, newest joined first. Counts only;
-- members' names, emails, phones and answers are never returned (ADR-0023).
CREATE OR REPLACE FUNCTION public.admin_leaders()
RETURNS TABLE (
  id UUID, email TEXT, full_name TEXT, created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ,
  studies INT, signups INT, shared INT, ask_ai_month INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE
  v_month TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');
BEGIN
  PERFORM public.assert_site_admin();
  RETURN QUERY
  SELECT u.id, u.email::TEXT,
    coalesce(nullif(u.raw_user_meta_data->>'full_name', ''), nullif(u.raw_user_meta_data->>'name', '')),
    u.created_at, u.last_sign_in_at,
    (SELECT count(*)::INT FROM study_packs p WHERE p.leader_id = u.id),
    (SELECT count(*)::INT FROM study_signups s WHERE s.leader_id = u.id AND s.replaced_at IS NULL),
    (SELECT count(*)::INT FROM checkin_answers a WHERE a.leader_id = u.id),
    (SELECT coalesce(sum(q.count), 0)::INT FROM ai_usage q WHERE q.leader_id = u.id AND q.month = v_month AND q.role = 'ask')
  FROM auth.users u
  ORDER BY u.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_leaders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_leaders() TO authenticated;

-- admin_feedback() — the feedback messages, newest first. Never ip_hash.
CREATE OR REPLACE FUNCTION public.admin_feedback()
RETURNS TABLE (id UUID, message TEXT, email TEXT, context JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_site_admin();
  RETURN QUERY
  SELECT f.id, f.message, f.email, f.context, f.created_at
  FROM feedback f
  ORDER BY f.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_feedback() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_feedback() TO authenticated;

-- admin_stats() — site_stats() totals plus:
--   accounts        every signed-in account (auth.users rows)
--   active_leaders  active this LA calendar month (definition at the top)
--   month_start     the start of that month, as a timestamp
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start TIMESTAMPTZ := date_trunc('month', now() AT TIME ZONE 'America/Los_Angeles') AT TIME ZONE 'America/Los_Angeles';
BEGIN
  PERFORM public.assert_site_admin();
  RETURN public.site_stats() || jsonb_build_object(
    'accounts', (SELECT count(*) FROM auth.users),
    'active_leaders', (
      SELECT count(DISTINCT active.uid) FROM (
        SELECT u.id AS uid FROM auth.users u WHERE u.last_sign_in_at >= v_start
        UNION SELECT p.leader_id FROM study_packs p WHERE p.updated_at >= v_start
        UNION SELECT q.leader_id FROM ai_usage q WHERE q.updated_at >= v_start AND q.count > 0
      ) active),
    'month_start', v_start
  );
END $$;
REVOKE ALL ON FUNCTION public.admin_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats() TO authenticated;

-- =====================================================
-- THE FIRST ADMIN — the site owner's account (owner decision, ADR-0023)
-- =====================================================
-- Separate on purpose: adding an admin is a conscious SQL step. Idempotent;
-- inserts nothing until that account has signed in once.
INSERT INTO site_admins (user_id)
SELECT id FROM auth.users WHERE email = 'csheargm@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
