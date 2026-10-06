-- Sign-ups go through the `signup` edge function only · 报名只经服务端 (ADR-0013)
--
-- Why: the anon key could INSERT into study_signups directly. The original
-- policy checked only leader_id IS NOT NULL, so anyone could file sign-ups
-- under any leader's pack, then ask send-checkins for the welcome email of
-- each row — our sending domain mailing any address a script chose (spam
-- relay; the Resend domain would be blocked). mark_replaced_signups was
-- anon-callable too: whoever knew a member's email + pack could retire
-- that member's sign-up. database/signup-interim-guard.sql (2026-10-06)
-- narrowed the policy to the pack's real owner and added the rate-guard
-- trigger as a stopgap.
--
-- Now the `signup` edge function (service role) is the only writer: it
-- validates, rate-limits per salted IP hash (ip_hash, added by
-- signup-ip-hash-schema.sql), takes
-- leader_id + pack_title from study_packs, checks the practices against the
-- pack's life menu, inserts, retires the earlier rows and asks for the
-- welcome as a trusted caller (send-checkins refuses an anonymous welcome).
-- This file closes the direct paths:
--   * the anon/authenticated INSERT policy and its helper
--     signup_owner_matches (only that policy used it) are dropped, and the
--     INSERT privilege is revoked, so a direct insert fails even if a
--     policy reappears;
--   * mark_replaced_signups is executable by service_role only.
-- KEPT: the study_signups_rate_guard trigger (signup-interim-guard.sql). It
-- fires on the function's service-role insert too, and it is the one copy
-- of the per-pack (hour) and per-pack + email (day) caps; the function
-- turns its P0001 refusal into a 429 with the trigger's bilingual line.
--
-- Apply order (release, ADR-0013): apply signup-ip-hash-schema.sql, set
-- the IP_HASH_SALT secret, deploy the `signup` function, deploy the site
-- (the page calls the function), deploy send-checkins (anonymous welcome
-- closed), THEN apply this file — before the site switch the live page
-- still inserts directly. Apply AFTER signups-schema.sql,
-- signup-replace-schema.sql and signup-interim-guard.sql. Idempotent
-- (IF EXISTS, REVOKE/GRANT), so re-running is safe.

DROP POLICY IF EXISTS "Anyone may sign up for an owned pack" ON study_signups;
DROP FUNCTION IF EXISTS public.signup_owner_matches(TEXT, UUID);
REVOKE INSERT ON study_signups FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_replaced_signups(UUID) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_replaced_signups(UUID) TO service_role;
