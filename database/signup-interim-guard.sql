-- Sign-up rate guard · 报名限流 (2026-10-06)
--
-- Began as the interim guard while the `signup` edge function (ADR-0013)
-- was built: the browser still inserted with the anon key, and the old
-- policy only checked leader_id IS NOT NULL. Its first part — an anon
-- INSERT policy requiring the pack's real owner through a SECURITY DEFINER
-- helper, signup_owner_matches — was applied live 2026-10-06 and is
-- removed by database/signup-endpoint-schema.sql (anon has no INSERT at
-- all now), so it is no longer in this file. What stays:
--
-- A BEFORE INSERT trigger caps sign-ups: at most SIGNUPS_PER_PACK_HOUR
--    per pack per rolling hour, at most SIGNUPS_PER_EMAIL_DAY per pack +
--    email per rolling day. That bounds how many welcome emails a script
--    can cause. The trigger applies to every writer, the `signup` edge
--    function's service-role insert included: it is the one copy of these
--    two caps (R3). The function maps its P0001 refusal to a 429 carrying
--    the message below (supabase/functions/_shared/signup.ts
--    RATE_GUARD_ERRCODE); the function adds only a per-IP cap of its own.
--
-- Idempotent. Applied live through the management API. Apply AFTER
-- signups-schema.sql.

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
