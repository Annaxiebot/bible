-- Leader settings sync · 组长设置同步 (ADR-0005)
--
-- Apply AFTER supabase-schema.sql: open the Supabase dashboard → SQL editor →
-- paste this whole file → Run. Idempotent (IF NOT EXISTS / DROP POLICY IF
-- EXISTS), so re-running is safe. Applied to the live project through the
-- management API on 2026-10-02.
--
-- What lives here: the few per-leader preferences the #/setup and New-study
-- forms remember (Ask-AI model, pack-generation model, fallback models,
-- content-language default, default feedback-form link) as one JSONB map
-- keyed by the app's localStorage key names (services/leaderSettingsKeys.ts
-- is the single list). The OpenRouter API key and the provider are NEVER
-- written here — keys stay in the browser (ADR-0005).
--
-- Access: a leader reads and writes only their own row ("auth.uid() =
-- leader_id", mirroring supabase-schema.sql). No anon access of any kind:
-- members never sign in and never need these settings. No DELETE policy:
-- the row goes with the account (ON DELETE CASCADE); an emptied settings
-- map is written as '{}' instead.

-- =====================================================
-- LEADER_SETTINGS — one row per leader
-- =====================================================
CREATE TABLE IF NOT EXISTS leader_settings (
  leader_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { "<localStorage key>": "<value>", ... }
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leader_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders can view their own settings" ON leader_settings;
CREATE POLICY "Leaders can view their own settings"
  ON leader_settings FOR SELECT
  TO authenticated
  USING (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can insert their own settings" ON leader_settings;
CREATE POLICY "Leaders can insert their own settings"
  ON leader_settings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = leader_id);

DROP POLICY IF EXISTS "Leaders can update their own settings" ON leader_settings;
CREATE POLICY "Leaders can update their own settings"
  ON leader_settings FOR UPDATE
  TO authenticated
  USING (auth.uid() = leader_id)
  WITH CHECK (auth.uid() = leader_id);

-- No DELETE policy and nothing for anon, on purpose.

-- Keep updated_at honest on every upsert (same shape as pack_summaries_touch).
CREATE OR REPLACE FUNCTION public.touch_leader_settings() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS leader_settings_touch ON leader_settings;
CREATE TRIGGER leader_settings_touch BEFORE UPDATE ON leader_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_leader_settings();
