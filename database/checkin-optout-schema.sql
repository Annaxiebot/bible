-- Three levels of "stop" for check-in emails · 退订与暂停提醒 (ADR-0009)
--
-- Apply AFTER signups-schema.sql, signup-practices-schema.sql and
-- signup-replace-schema.sql: open the Supabase dashboard → SQL editor →
-- paste this whole file → Run. Idempotent (ADD COLUMN IF NOT EXISTS, DROP
-- ... IF EXISTS before each re-create, CREATE OR REPLACE), so re-running is
-- safe.
--
-- 1. Member: unsubscribe_signup / resubscribe_signup. Knowing the signup id
--    (the private check-in link token, ADR-0004 §7) is the authority — the
--    same model as checkin_context / share_checkin_answer. Both act on "this
--    person in this pack": the row itself and every row with the same
--    pack_id + lower(trim(email)) (signup-replace-schema.sql's key), so a
--    link from an email sent before a re-sign-up still stops the live row.
--    send-checkins' one-click endpoint (List-Unsubscribe-Post, RFC 8058)
--    calls unsubscribe_signup with the service role.
-- 2. Leader: leader_set_signup_subscription(id, stop) — only the row's
--    leader (auth.uid() = leader_id). A leader may stop anyone, but may not
--    resume a member who unsubscribed themselves (SQLSTATE STL01).
-- 3. Pause: pack_summaries.checkins_paused (owner writes it under the
--    existing "Leaders can update their own pack summaries" policy). The
--    site-wide switch is the CHECKIN_PAUSED secret (runbook in
--    signups-schema.sql), not a column.

ALTER TABLE study_signups ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
ALTER TABLE study_signups ADD COLUMN IF NOT EXISTS unsubscribed_by TEXT;
ALTER TABLE study_signups DROP CONSTRAINT IF EXISTS study_signups_unsubscribed_by;
ALTER TABLE study_signups ADD CONSTRAINT study_signups_unsubscribed_by
  CHECK (unsubscribed_by IS NULL OR unsubscribed_by IN ('member', 'leader'));

ALTER TABLE pack_summaries ADD COLUMN IF NOT EXISTS checkins_paused BOOLEAN NOT NULL DEFAULT false;

-- Member stop. Idempotent: an already-stopped row keeps its first time, and
-- the stop is recorded as the member's own (which a leader may not undo).
-- Returns whether the token matched a row.
CREATE OR REPLACE FUNCTION public.unsubscribe_signup(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pack TEXT;
  v_email TEXT;
BEGIN
  SELECT s.pack_id, lower(trim(coalesce(s.email, ''))) INTO v_pack, v_email FROM study_signups s WHERE s.id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE study_signups
  SET unsubscribed_at = coalesce(unsubscribed_at, now()), unsubscribed_by = 'member'
  WHERE id = p_id OR (v_email <> '' AND pack_id = v_pack AND lower(trim(email)) = v_email);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.unsubscribe_signup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsubscribe_signup(UUID) TO anon, authenticated, service_role;

-- Member resume: the link holder may resume any stop of their own rows.
CREATE OR REPLACE FUNCTION public.resubscribe_signup(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pack TEXT;
  v_email TEXT;
BEGIN
  SELECT s.pack_id, lower(trim(coalesce(s.email, ''))) INTO v_pack, v_email FROM study_signups s WHERE s.id = p_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE study_signups
  SET unsubscribed_at = NULL, unsubscribed_by = NULL
  WHERE id = p_id OR (v_email <> '' AND pack_id = v_pack AND lower(trim(email)) = v_email);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.resubscribe_signup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resubscribe_signup(UUID) TO anon, authenticated;

-- Leader stop/resume of one row. Returns the row's new state (true = stopped).
-- A stop keeps who stopped first; resuming a member's own stop raises STL01.
CREATE OR REPLACE FUNCTION public.leader_set_signup_subscription(p_id UUID, p_stop BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_leader UUID;
  v_at TIMESTAMPTZ;
  v_by TEXT;
BEGIN
  SELECT s.leader_id, s.unsubscribed_at, s.unsubscribed_by INTO v_leader, v_at, v_by FROM study_signups s WHERE s.id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sign-up % not found', p_id USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NULL OR v_leader <> auth.uid() THEN
    RAISE EXCEPTION 'not your sign-up' USING ERRCODE = '42501';
  END IF;
  IF p_stop THEN
    UPDATE study_signups
    SET unsubscribed_at = coalesce(unsubscribed_at, now()), unsubscribed_by = coalesce(unsubscribed_by, 'leader')
    WHERE id = p_id;
    RETURN true;
  END IF;
  IF v_at IS NOT NULL AND v_by = 'member' THEN
    RAISE EXCEPTION 'member-unsubscribed' USING ERRCODE = 'STL01';
  END IF;
  UPDATE study_signups SET unsubscribed_at = NULL, unsubscribed_by = NULL WHERE id = p_id;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.leader_set_signup_subscription(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leader_set_signup_subscription(UUID, BOOLEAN) TO authenticated;

-- What the check-in page may know about its token: the pack title, the
-- member's first name and commitment (every chosen practice + the legacy
-- first-practice columns), the three check-in prompt lines, the retired
-- feedback_form_url (Google Forms removed 2026-10-05, ADR-0004 §9; the app
-- ignores it — removing it is the owner-approved later cleanup), and
-- whether reminders are stopped. Never phone or email.
-- Single definition (moved here from signup-practices-schema.sql); the
-- return type changed (unsubscribed_at added), which CREATE OR REPLACE
-- cannot do, hence the DROP first.
DROP FUNCTION IF EXISTS public.checkin_context(UUID);
CREATE FUNCTION public.checkin_context(p_signup_id UUID)
RETURNS TABLE (
  pack_id TEXT, pack_title TEXT, name TEXT,
  practice_area TEXT, practice_text TEXT, practice_note TEXT,
  reflection_lines TEXT[], feedback_form_url TEXT,
  practices JSONB, unsubscribed_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.pack_id, s.pack_title, s.name,
         s.practice_area, s.practice_text, s.practice_note,
         COALESCE(p.reflection_lines, '{}'), p.feedback_form_url,
         s.practices, s.unsubscribed_at
  FROM study_signups s
  LEFT JOIN pack_summaries p ON p.pack_id = s.pack_id
  WHERE s.id = p_signup_id;
$$;
REVOKE ALL ON FUNCTION public.checkin_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_context(UUID) TO anon, authenticated;
