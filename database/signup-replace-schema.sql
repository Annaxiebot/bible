-- A later sign-up replaces an earlier one · 重复报名以最新为准 (ADR-0004)
--
-- Apply AFTER signups-schema.sql and signup-practices-schema.sql: open the
-- Supabase dashboard → SQL editor → paste this whole file → Run. Idempotent
-- (ADD COLUMN / CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION), so
-- re-running is safe.
--
-- The same person submitting twice for one pack used to get every check-in
-- twice and be counted twice. Anon still has no UPDATE (or SELECT) policy:
-- after its insert, the member's browser calls mark_replaced_signups with
-- the id it just created, and this SECURITY DEFINER function marks every
-- OTHER live row for the same pack + lower(trim(email)) as replaced. It
-- returns only a count — never another row's id (an id is a member's
-- check-in token; whoever types someone's email must not get their link).
-- Replaced rows are kept, only marked: their checkin_answers stay linked and
-- the old check-in link keeps working (checkin_context is unchanged).
-- Readers skip replaced_at IS NOT NULL: send-checkins (loadSignups +
-- recipients.selectRecipients), the leader roster and counts (leaderData,
-- leaderHomeData) and the last-week sharing counts.

ALTER TABLE study_signups ADD COLUMN IF NOT EXISTS replaced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_study_signups_pack_email ON study_signups(pack_id, lower(trim(email)));

-- The window matches the welcome email's (recipients.WELCOME_WINDOW_MS):
-- only a row created in the last 10 minutes may replace, and only rows
-- created no later than itself (an older id can never replace a newer one).
CREATE OR REPLACE FUNCTION public.mark_replaced_signups(p_new_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pack TEXT;
  v_email TEXT;
  v_created TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  SELECT s.pack_id, lower(trim(s.email)), s.created_at INTO v_pack, v_email, v_created
  FROM study_signups s
  WHERE s.id = p_new_id AND s.replaced_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sign-up % not found', p_new_id USING ERRCODE = 'P0002';
  END IF;
  IF v_created < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'sign-up % is outside the replace window', p_new_id USING ERRCODE = '22023';
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN 0;
  END IF;
  UPDATE study_signups
  SET replaced_at = now()
  WHERE pack_id = v_pack
    AND lower(trim(email)) = v_email
    AND id <> p_new_id
    AND replaced_at IS NULL
    AND created_at <= v_created;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_replaced_signups(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_replaced_signups(UUID) TO anon, authenticated;
