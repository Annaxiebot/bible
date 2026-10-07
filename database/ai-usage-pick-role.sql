-- Hosted AI quota: the 'pick' role · 本站AI用量：选经文角色 (ADR-0016)
--
-- Ask AI's short first call (role 'pick') chooses related verses for the
-- question; the ai-proxy counts it against its own monthly limit
-- (AI_MONTHLY_PICK, default 600). consume_ai_quota inserts a row with
-- role = 'pick', which the CHECK in ai-usage-schema.sql (applied 2026-10-05)
-- rejects until this runs — so apply it BEFORE deploying the ai-proxy that
-- knows the role.
--
-- Apply: Supabase dashboard → SQL editor → paste this file → Run.
-- Idempotent: the CHECK is dropped and re-added with the full role list
-- (= supabase/functions/ai-proxy/policy AI_ROLES, pinned by
-- database/__tests__/aiUsageSchema.test.ts), so re-running is safe.
-- ai-usage-schema.sql carries the same list for a fresh install.

ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_role_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_role_check
  CHECK (role IN ('ask', 'pack', 'adjust', 'sharing', 'study', 'pick'));
