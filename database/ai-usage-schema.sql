-- Hosted AI monthly quota · 本站AI月度用量 (ADR-0007)
--
-- Apply AFTER supabase-schema.sql: open the Supabase dashboard → SQL editor →
-- paste this whole file → Run. Idempotent (IF NOT EXISTS / DROP POLICY IF
-- EXISTS / CREATE OR REPLACE), so re-running is safe. Applied to the live
-- project through the management API on 2026-10-03; the 'study' role (the
-- personal app, ADR-0007 "Personal app") widened the role CHECK on 2026-10-05;
-- the 'pick' role (Ask AI's related-verse pick, ADR-0016) widens it again —
-- on the live project apply ai-usage-pick-role.sql (the CHECK only).
--
-- What lives here: one counter per leader, per calendar month (UTC,
-- 'YYYY-MM'), per AI role ('ask' | 'pack' | 'adjust' | 'sharing' | 'study' | 'pick'). The
-- ai-proxy Edge Function counts every call it forwards; message content is
-- never stored. `monthly_limit` records the limit in force at the last call
-- so #/setup can show "12/300" without knowing the server's secrets.
--
-- Access: a leader may SELECT their own rows only. Nobody writes from a
-- client: the only writer is consume_ai_quota(), SECURITY DEFINER, executable
-- by service_role alone (the Edge Function's service client).

-- =====================================================
-- AI_USAGE — one row per leader × month × role
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_usage (
  leader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),   -- UTC 'YYYY-MM'
  role TEXT NOT NULL,
  count INT NOT NULL DEFAULT 0,
  monthly_limit INT,                                           -- limit in force at the last call
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (leader_id, month, role)
);

-- The role list = supabase/functions/ai-proxy/policy AI_ROLES (pinned by
-- database/__tests__/aiUsageSchema.test.ts). Dropped and re-added so a
-- re-run widens the CHECK on a table created with an older list.
ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_role_check;
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_role_check
  CHECK (role IN ('ask', 'pack', 'adjust', 'sharing', 'study', 'pick'));

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders can view their own AI usage" ON ai_usage;
CREATE POLICY "Leaders can view their own AI usage"
  ON ai_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = leader_id);

-- No INSERT/UPDATE/DELETE policy, and the table privileges are revoked too
-- (belt and braces): a client can never raise its own allowance.
REVOKE INSERT, UPDATE, DELETE ON ai_usage FROM anon, authenticated;

-- =====================================================
-- consume_ai_quota — the only writer
-- =====================================================
-- Atomically counts one call for this month: returns the new count, or -1
-- when the count already reached p_limit (nothing is incremented then).
-- The UPDATE's "count < p_limit" is re-checked under the row lock, so two
-- concurrent calls can never both take the last slot.
CREATE OR REPLACE FUNCTION public.consume_ai_quota(p_leader UUID, p_role TEXT, p_limit INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT := to_char(timezone('UTC', now()), 'YYYY-MM');
  v_count INT;
BEGIN
  INSERT INTO ai_usage (leader_id, month, role, count, monthly_limit)
  VALUES (p_leader, v_month, p_role, 0, p_limit)
  ON CONFLICT (leader_id, month, role) DO NOTHING;

  UPDATE ai_usage
     SET count = count + 1, monthly_limit = p_limit, updated_at = now()
   WHERE leader_id = p_leader AND month = v_month AND role = p_role AND count < p_limit
  RETURNING count INTO v_count;

  IF v_count IS NULL THEN
    UPDATE ai_usage SET monthly_limit = p_limit
     WHERE leader_id = p_leader AND month = v_month AND role = p_role;
    RETURN -1;
  END IF;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_quota(UUID, TEXT, INT) TO service_role;
