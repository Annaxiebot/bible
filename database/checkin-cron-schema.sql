-- Automatic Tue / Thu / weekend check-ins · 自动周中提醒 (ADR-0004 §6, ADR-0009)
--
-- Apply AFTER signups-schema.sql and checkin-optout-schema.sql. Idempotent:
-- re-running replaces the function and the jobs. Switched on 2026-10-05 with
-- the owner's approval.
--
-- Which studies get a reminder: every pack with at least one live sign-up
-- (not replaced, not unsubscribed, opted in) created in the last
-- CHECKIN_WINDOW_DAYS days. Friday's sign-ups get that week's Tue / Thu /
-- Sat emails and then age out; no "current study" needs to be maintained.
-- The edge function still applies every per-row and per-pack rule itself
-- (consent, replaced, unsubscribed, per-pack pause, site-wide CHECKIN_PAUSED).
--
-- Timing: pg_cron runs in UTC. 09:00 America/Los_Angeles is 16:00 UTC in
-- PDT (summer) and 17:00 UTC in PST (winter); both lines run, the body
-- carries "scheduled": true, and send-checkins sends only during the 09:00
-- LA hour (templates.isSendHour), so exactly one of each pair delivers.
--
-- Secrets: the call authenticates with the trusted-caller header
-- (x-checkin-secret = CHECKIN_CRON_SECRET, supabase/functions/send-checkins/
-- trust.ts) plus the anon key for the functions gateway. Both live in Vault,
-- created OUTSIDE this file (never commit them):
--   SELECT vault.create_secret('<anon key>', 'checkin_anon_key');
--   SELECT vault.create_secret('<CHECKIN_CRON_SECRET>', 'checkin_cron_secret');
--   SELECT vault.create_secret('https://<project-ref>.supabase.co', 'checkin_project_url');
--
-- Inspect: SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE 'checkins-%';
--          SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--          SELECT id, status_code, content FROM net._http_response ORDER BY created DESC LIMIT 20;
-- Pause everything: supabase secrets set CHECKIN_PAUSED=1 (no SQL needed).
-- Remove: SELECT cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'checkins-%';

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.call_send_checkins(p_kind TEXT) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- CHECKIN_WINDOW_DAYS: a sign-up gets the reminders of the week it was made in.
  window_days CONSTANT INTEGER := 8;
  base_url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'checkin_project_url');
  anon_key TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'checkin_anon_key');
  cron_secret TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'checkin_cron_secret');
  pack TEXT;
  calls INTEGER := 0;
BEGIN
  IF p_kind NOT IN ('tue', 'thu', 'weekend') THEN
    RAISE EXCEPTION 'call_send_checkins: unknown kind %', p_kind;
  END IF;
  IF base_url IS NULL OR anon_key IS NULL OR cron_secret IS NULL THEN
    RAISE EXCEPTION 'call_send_checkins: Vault secrets checkin_project_url / checkin_anon_key / checkin_cron_secret are missing';
  END IF;
  FOR pack IN
    SELECT DISTINCT s.pack_id FROM study_signups s
    WHERE s.replaced_at IS NULL AND s.unsubscribed_at IS NULL AND s.consent_checkins
      AND s.created_at > now() - make_interval(days => window_days)
  LOOP
    PERFORM net.http_post(
      url := base_url || '/functions/v1/send-checkins',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key,
        'x-checkin-secret', cron_secret),
      body := jsonb_build_object('pack_id', pack, 'kind', p_kind, 'scheduled', true)
    );
    calls := calls + 1;
  END LOOP;
  RETURN calls;
END $$;
REVOKE ALL ON FUNCTION public.call_send_checkins(TEXT) FROM PUBLIC, anon, authenticated;

-- Tue / Thu / Sat, at 16:00 and 17:00 UTC (09:00 LA in PDT / PST).
SELECT cron.schedule('checkins-tue-pdt', '0 16 * * 2', $$SELECT public.call_send_checkins('tue')$$);
SELECT cron.schedule('checkins-tue-pst', '0 17 * * 2', $$SELECT public.call_send_checkins('tue')$$);
SELECT cron.schedule('checkins-thu-pdt', '0 16 * * 4', $$SELECT public.call_send_checkins('thu')$$);
SELECT cron.schedule('checkins-thu-pst', '0 17 * * 4', $$SELECT public.call_send_checkins('thu')$$);
SELECT cron.schedule('checkins-sat-pdt', '0 16 * * 6', $$SELECT public.call_send_checkins('weekend')$$);
SELECT cron.schedule('checkins-sat-pst', '0 17 * * 6', $$SELECT public.call_send_checkins('weekend')$$);
