-- Interim sign-up guard · 报名临时防护 (2026-10-06)
--
-- Stopgap while the `signup` edge function (ADR-0013) is built. Until then
-- the browser still inserts into study_signups with the anon key, and the old
-- policy only checked leader_id IS NOT NULL — anyone could file sign-ups
-- under any leader, and each row can trigger one welcome email. This file
-- changes nothing for real members (the page already sends the pack's own
-- leader_id) and closes the worst of it in the database:
--
-- 1. The insert policy also requires leader_id to be the pack's owner in
--    study_packs (checked by a SECURITY DEFINER helper, because anon cannot
--    read study_packs under its RLS).
-- 2. A BEFORE INSERT trigger caps sign-ups: at most SIGNUPS_PER_PACK_HOUR
--    per pack per rolling hour, at most SIGNUPS_PER_EMAIL_DAY per pack +
--    email per rolling day. That bounds how many welcome emails a script
--    can cause. The trigger applies to every writer, the future edge
--    function included, so the limits stay true after the switch.
--
-- Idempotent. Applied live through the management API.

CREATE OR REPLACE FUNCTION public.signup_owner_matches(p_pack_id TEXT, p_leader_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM study_packs WHERE id = p_pack_id AND leader_id = p_leader_id);
$$;
REVOKE ALL ON FUNCTION public.signup_owner_matches(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.signup_owner_matches(TEXT, UUID) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone may sign up for an owned pack" ON study_signups;
CREATE POLICY "Anyone may sign up for an owned pack"
  ON study_signups FOR INSERT
  TO anon, authenticated
  WITH CHECK (leader_id IS NOT NULL AND public.signup_owner_matches(pack_id, leader_id));

CREATE OR REPLACE FUNCTION public.signup_rate_guard() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- SIGNUPS_PER_PACK_HOUR / SIGNUPS_PER_EMAIL_DAY
  per_pack_hour CONSTANT INTEGER := 60;
  per_email_day CONSTANT INTEGER := 5;
BEGIN
  IF (SELECT count(*) FROM study_signups
      WHERE pack_id = NEW.pack_id AND created_at > now() - interval '1 hour') >= per_pack_hour THEN
    RAISE EXCEPTION '这个查经一小时内报名太多，请稍后再试 · Too many sign-ups for this study in the last hour — please try again later'
      USING ERRCODE = 'P0001';
  END IF;
  IF NEW.email IS NOT NULL AND (SELECT count(*) FROM study_signups
      WHERE pack_id = NEW.pack_id AND lower(trim(email)) = lower(trim(NEW.email))
        AND created_at > now() - interval '1 day') >= per_email_day THEN
    RAISE EXCEPTION '这个电邮今天报名次数太多，请明天再试 · Too many sign-ups with this email today — please try again tomorrow'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.signup_rate_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS study_signups_rate_guard ON study_signups;
CREATE TRIGGER study_signups_rate_guard BEFORE INSERT ON study_signups
  FOR EACH ROW EXECUTE FUNCTION public.signup_rate_guard();
