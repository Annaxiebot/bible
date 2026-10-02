-- Per-pack sign-ups + automated check-in audit trail · 报名与周中提醒
--
-- Apply AFTER supabase-schema.sql: open the Supabase dashboard → SQL editor →
-- paste this whole file → Run. Idempotent (IF NOT EXISTS / DROP POLICY IF
-- EXISTS), so re-running is safe.
--
-- Privacy (ADR-0003 §17, ADR-0004): sign-up data is used only for the
-- mid-week check-ins the member opted into. Members never log in — they scan
-- a QR, so the anon key may INSERT a row (carrying the pack's leader_id) and
-- nothing else. A leader may read and delete only rows whose leader_id is
-- their own auth uid, mirroring the "auth.uid() = user_id" policies in
-- supabase-schema.sql. The scheduler runs as the service role, which
-- bypasses RLS and verifies the pack ↔ leader pairing itself.

-- =====================================================
-- STUDY_SIGNUPS — one row per member per pack
-- =====================================================
CREATE TABLE IF NOT EXISTS study_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id TEXT NOT NULL,                  -- e.g. "2026-10-02-matt6" or "local-2026-10-02-jhn3"
  leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- the pack's owner (StudyPack.leaderId)
  pack_title TEXT,                        -- copied at sign-up so the row reads on its own
  name TEXT NOT NULL,
  phone TEXT,                             -- E.164 preferred; SMS only once CHECKIN_SMS_ENABLED
  email TEXT,
  consent_checkins BOOLEAN NOT NULL DEFAULT TRUE,  -- "周二/周四收到提醒"
  locale TEXT NOT NULL DEFAULT 'zh',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT study_signups_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_study_signups_pack_id ON study_signups(pack_id);
CREATE INDEX IF NOT EXISTS idx_study_signups_leader_id ON study_signups(leader_id);
CREATE INDEX IF NOT EXISTS idx_study_signups_pack_created ON study_signups(pack_id, created_at DESC);

ALTER TABLE study_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone may sign up for an owned pack" ON study_signups;
CREATE POLICY "Anyone may sign up for an owned pack"
  ON study_signups FOR INSERT
  TO anon, authenticated
  WITH CHECK (leader_id IS NOT NULL);

DROP POLICY IF EXISTS "Leaders can view their own sign-ups" ON study_signups;
CREATE POLICY "Leaders can view their own sign-ups"
  ON study_signups FOR SELECT
  TO authenticated
  USING (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can delete their own sign-ups" ON study_signups;
CREATE POLICY "Leaders can delete their own sign-ups"
  ON study_signups FOR DELETE
  TO authenticated
  USING (auth.uid() = leader_id);

-- No UPDATE policy on purpose: a sign-up is replaced by a new row, never edited.

-- =====================================================
-- PACK_SUMMARIES — the only part of a pack the server ever sees
-- =====================================================
-- Packs live in the leader's browser (IndexedDB). The owner's client upserts
-- this small row (title, passage, the three reflection lines, the closing
-- question) whenever it opens #/leader/<id>, shows the pack's QR, or saves
-- the pack. The edge function reads it with the service role to word the
-- check-ins. PRIVACY BOUNDARY: verses, context, discussion questions and
-- the life menu never leave the browser; nothing here is readable by anon.
CREATE TABLE IF NOT EXISTS pack_summaries (
  pack_id TEXT PRIMARY KEY,
  leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  passage_ref TEXT,
  reflection_lines TEXT[] NOT NULL DEFAULT '{}',   -- tue, thu, weekend prompt lines (中文 · English)
  closing_question TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pack_summaries_leader_id ON pack_summaries(leader_id);

ALTER TABLE pack_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders can view their own pack summaries" ON pack_summaries;
CREATE POLICY "Leaders can view their own pack summaries"
  ON pack_summaries FOR SELECT
  TO authenticated
  USING (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can insert their own pack summaries" ON pack_summaries;
CREATE POLICY "Leaders can insert their own pack summaries"
  ON pack_summaries FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can update their own pack summaries" ON pack_summaries;
CREATE POLICY "Leaders can update their own pack summaries"
  ON pack_summaries FOR UPDATE
  TO authenticated
  USING (auth.uid() = leader_id)
  WITH CHECK (auth.uid() = leader_id);

-- Keep updated_at honest on every upsert.
CREATE OR REPLACE FUNCTION public.touch_pack_summaries() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pack_summaries_touch ON pack_summaries;
CREATE TRIGGER pack_summaries_touch BEFORE UPDATE ON pack_summaries
  FOR EACH ROW EXECUTE FUNCTION public.touch_pack_summaries();

-- =====================================================
-- CHECKIN_SENDS — the scheduler's audit trail, one row per attempt
-- =====================================================
CREATE TABLE IF NOT EXISTS checkin_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signup_id UUID REFERENCES study_signups(id) ON DELETE SET NULL,
  pack_id TEXT NOT NULL,
  leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tue', 'thu', 'weekend')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,                   -- 'sent' | 'dry-run' | 'failed'
  error TEXT                              -- provider message when status = 'failed'
);

CREATE INDEX IF NOT EXISTS idx_checkin_sends_pack_kind ON checkin_sends(pack_id, kind, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_sends_signup ON checkin_sends(signup_id);
CREATE INDEX IF NOT EXISTS idx_checkin_sends_leader_id ON checkin_sends(leader_id);

ALTER TABLE checkin_sends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders can view their own send log" ON checkin_sends;
CREATE POLICY "Leaders can view their own send log"
  ON checkin_sends FOR SELECT
  TO authenticated
  USING (auth.uid() = leader_id);
-- Only the service role (the edge function) writes here; no INSERT policy for app roles.

-- =====================================================
-- SCHEDULE — pg_cron calls the send-checkins edge function via pg_net
-- =====================================================
-- Enable once, then uncomment and run the block below with your values.
--
-- 0. Sign in to the app with Google once (the leader's auth uid becomes
--    StudyPack.leaderId on every pack saved or imported while signed in; a
--    pack without leaderId is a demo pack with no sign-up — the committed
--    sample pack 2026-10-02-matt6 stays demo-only until its owner adds a
--    leaderId; re-import the local john3 pack while signed in to own it).
--    Then open #/leader/<packId> once (or show its QR) so pack_summaries
--    holds the pack's check-in text; the sender has nothing else to read.
-- 1. Deploy the function:
--      supabase functions deploy send-checkins
-- 2. Secrets (dashboard → Edge Functions → Secrets, or the CLI):
--      supabase secrets set RESEND_API_KEY=re_...            # resend.com → API keys
--      supabase secrets set CHECKIN_SMS_ENABLED=0            # flip to 1 after Twilio toll-free verification
--      supabase secrets set TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1...
--      supabase secrets set DRY_RUN=1                        # keep 1 until a dry run looks right in checkin_sends
--    SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
-- 3. Verify the sending domain in Resend (DNS: SPF + DKIM) so mail from
--    checkins@scripturetolife.org is not rejected. The FROM address is the
--    constant CHECKIN_FROM_EMAIL in supabase/functions/send-checkins/templates.ts.
-- 4. Extensions (dashboard → Database → Extensions): pg_cron, pg_net.
-- 5. Store the service-role key for pg_net (Vault), then schedule. pg_cron
--    runs in UTC; America/Los_Angeles 09:00 is 16:00 UTC in PST and 17:00 in
--    PDT. Two cron lines per kind cover both; the body carries
--    "scheduled": true, which makes the function send only during the 09:00
--    LA hour (CHECKIN_HOUR_LA), so exactly one of the pair delivers.
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- CREATE EXTENSION IF NOT EXISTS pg_net;
-- SELECT vault.create_secret('<service-role-key>', 'service_role_key');
-- SELECT vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--
-- CREATE OR REPLACE FUNCTION public.call_send_checkins(kind TEXT) RETURNS BIGINT
-- LANGUAGE plpgsql SECURITY DEFINER AS $$
-- DECLARE
--   url TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url');
--   key TEXT := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key');
--   current_pack TEXT := '2026-10-02-matt6';   -- update when the group moves to a new pack
-- BEGIN
--   RETURN net.http_post(
--     url := url || '/functions/v1/send-checkins',
--     headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key),
--     body := jsonb_build_object('pack_id', current_pack, 'kind', kind, 'scheduled', true)
--   );
-- END $$;
--
-- -- Tue 09:00 LA (16:00 UTC winter / 17:00 UTC summer; the function drops the off-hour call)
-- SELECT cron.schedule('checkins-tue-pst', '0 16 * * 2', $$SELECT public.call_send_checkins('tue')$$);
-- SELECT cron.schedule('checkins-tue-pdt', '0 17 * * 2', $$SELECT public.call_send_checkins('tue')$$);
-- SELECT cron.schedule('checkins-thu-pst', '0 16 * * 4', $$SELECT public.call_send_checkins('thu')$$);
-- SELECT cron.schedule('checkins-thu-pdt', '0 17 * * 4', $$SELECT public.call_send_checkins('thu')$$);
-- SELECT cron.schedule('checkins-sat-pst', '0 16 * * 6', $$SELECT public.call_send_checkins('weekend')$$);
-- SELECT cron.schedule('checkins-sat-pdt', '0 17 * * 6', $$SELECT public.call_send_checkins('weekend')$$);
--
-- Inspect: SELECT * FROM cron.job;  SELECT * FROM checkin_sends ORDER BY sent_at DESC LIMIT 50;
-- Remove:  SELECT cron.unschedule('checkins-tue-pst');  (one per name)
