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

-- What the check-in page may know about its token: the pack title, the
-- member's first name and commitment (every chosen practice + the legacy
-- first-practice columns), the three check-in prompt lines and the optional
-- feedback form. Never phone or email. The return type changed (practices
-- added), which CREATE OR REPLACE cannot do, hence the DROP first.
DROP FUNCTION IF EXISTS public.checkin_context(UUID);
CREATE FUNCTION public.checkin_context(p_signup_id UUID)
RETURNS TABLE (
  pack_id TEXT, pack_title TEXT, name TEXT,
  practice_area TEXT, practice_text TEXT, practice_note TEXT,
  reflection_lines TEXT[], feedback_form_url TEXT,
  practices JSONB
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT s.pack_id, s.pack_title, s.name,
         s.practice_area, s.practice_text, s.practice_note,
         COALESCE(p.reflection_lines, '{}'), p.feedback_form_url,
         s.practices
  FROM study_signups s
  LEFT JOIN pack_summaries p ON p.pack_id = s.pack_id
  WHERE s.id = p_signup_id;
$$;
REVOKE ALL ON FUNCTION public.checkin_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.checkin_context(UUID) TO anon, authenticated;
