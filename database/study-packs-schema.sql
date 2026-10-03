-- Full study packs follow the leader across devices · 查经包云端同步 (ADR-0006)
--
-- Apply AFTER supabase-schema.sql: open the Supabase dashboard → SQL editor →
-- paste this whole file → Run. Idempotent (IF NOT EXISTS / DROP POLICY IF
-- EXISTS / CREATE OR REPLACE), so re-running is safe. Applied to the live
-- project through the management API on 2026-10-03.
--
-- What lives here: the leader's whole StudyPack JSON (verses, questions, life
-- menu — everything the editor and TV mode read), one row per pack id. The
-- browser's IndexedDB stays the working copy (local-first); a signed-in
-- leader's client mirrors every save here and pulls the rows on sign-in
-- (components/newstudy/packSync.ts). Conflict rule: the copy with the newer
-- pack.updatedAt wins.
--
-- Access: a leader reads and writes only their own rows ("auth.uid() =
-- leader_id", mirroring leader-settings-schema.sql). No anon access of any
-- kind — members never see a full pack. pack_summaries (signups-schema.sql)
-- stays the small projection the sign-up page and send-checkins read; this
-- table does not replace it.

-- =====================================================
-- STUDY_PACKS — one row per leader-owned pack
-- =====================================================
CREATE TABLE IF NOT EXISTS study_packs (
  id TEXT PRIMARY KEY,                       -- the pack id, e.g. "local-2026-10-02-jhn3"
  leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  pack JSONB NOT NULL,                       -- the validated StudyPack JSON (parseStudyPack)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_packs_leader_id ON study_packs(leader_id);

ALTER TABLE study_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders can view their own packs" ON study_packs;
CREATE POLICY "Leaders can view their own packs"
  ON study_packs FOR SELECT
  TO authenticated
  USING (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can insert their own packs" ON study_packs;
CREATE POLICY "Leaders can insert their own packs"
  ON study_packs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can update their own packs" ON study_packs;
CREATE POLICY "Leaders can update their own packs"
  ON study_packs FOR UPDATE
  TO authenticated
  USING (auth.uid() = leader_id)
  WITH CHECK (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can delete their own packs" ON study_packs;
CREATE POLICY "Leaders can delete their own packs"
  ON study_packs FOR DELETE
  TO authenticated
  USING (auth.uid() = leader_id);

-- Nothing for anon, on purpose.

-- Keep updated_at honest on every upsert (same shape as touch_leader_settings).
CREATE OR REPLACE FUNCTION public.touch_study_packs() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS study_packs_touch ON study_packs;
CREATE TRIGGER study_packs_touch BEFORE UPDATE ON study_packs
  FOR EACH ROW EXECUTE FUNCTION public.touch_study_packs();
