-- Site feedback · 意见反馈 (ADR-0011)
--
-- Apply after supabase-schema.sql (dashboard SQL editor, or the management
-- API). Idempotent: IF NOT EXISTS, constraints dropped and re-added, policies
-- dropped. Applied to the live project through the management API on
-- 2026-10-06.
--
-- One row per message sent from the public #/feedback page. The only writer
-- is the `feedback` edge function (service role), which validates first and
-- rate-limits by ip_hash (salted SHA-256 of the client IP — the raw address
-- is never stored). Nobody reads through the API: no policy for anon or
-- authenticated, and their table privileges are revoked too. The owner reads
-- rows in the Supabase dashboard (table editor), which uses the service role.
-- The limits equal supabase/functions/_shared/feedback.ts (pinned by
-- database/__tests__/feedbackSchema.test.ts).

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  email TEXT,
  context JSONB,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_message_length;
ALTER TABLE feedback ADD CONSTRAINT feedback_message_length
  CHECK (char_length(message) BETWEEN 1 AND 2000);
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_email_length;
ALTER TABLE feedback ADD CONSTRAINT feedback_email_length
  CHECK (email IS NULL OR char_length(email) <= 200);

-- The rate-limit query: rows for one ip_hash in the last hour.
CREATE INDEX IF NOT EXISTS feedback_ip_hash_created_at ON feedback (ip_hash, created_at);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- No policy for anon or authenticated (RLS denies everything), and the
-- privileges are revoked as well (belt and braces).
REVOKE ALL ON feedback FROM anon, authenticated;
