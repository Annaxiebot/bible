-- Any number of practices per sign-up · 报名可选多项操练 (ADR-0004 §7)
--
-- Apply AFTER signups-schema.sql: open the Supabase dashboard → SQL editor →
-- paste this whole file → Run. Idempotent (ADD COLUMN IF NOT EXISTS, DROP
-- ... IF EXISTS before each re-create), so re-running is safe. Applied to
-- the live project through the management API on 2026-10-04.
--
-- Storage: practices JSONB = every life-menu row the member chose, in tap
-- order, as [{"area": "...", "practice": "..."}]. The insert still writes
-- practice_area/practice_text (= the first) and practice2_area/
-- practice2_text (= the second) so older readers keep working; rows from
-- before this column have practices NULL and only those legacy columns
-- (readers fall back: supabase/functions/send-checkins/practices.ts).
-- The anon INSERT policy (signups-schema.sql) checks rows, not columns, so
-- it needs no change; anon still cannot read the table.

ALTER TABLE study_signups ADD COLUMN IF NOT EXISTS practices JSONB;

-- A malformed value (an object, a string) would silently read as "no practices".
ALTER TABLE study_signups DROP CONSTRAINT IF EXISTS study_signups_practices_array;
ALTER TABLE study_signups ADD CONSTRAINT study_signups_practices_array
  CHECK (practices IS NULL OR jsonb_typeof(practices) = 'array');

-- checkin_context(p_signup_id) — what the check-in page may know about its
-- token, now including practices — lives in database/checkin-optout-schema.sql
-- (apply it after this file); its return type grew again there
-- (unsubscribed_at), so it has exactly one definition.
