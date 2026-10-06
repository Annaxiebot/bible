-- The signup function's per-IP column · 报名 IP 哈希列 (ADR-0013)
--
-- The `signup` edge function stores a salted SHA-256 of the caller's IP
-- (supabase/functions/_shared/clientIp.ts; never the raw address) with each
-- row and counts rows per ip_hash in the last hour for its per-IP cap.
--
-- Apply BEFORE the site switches to the function (release step 1 in
-- ADR-0013): the function's insert carries ip_hash, and this file changes
-- nothing for the live page. The doors are closed later, by
-- signup-endpoint-schema.sql. Idempotent (IF NOT EXISTS).

ALTER TABLE study_signups ADD COLUMN IF NOT EXISTS ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_study_signups_ip_created ON study_signups(ip_hash, created_at);
-- The rate-guard trigger's per pack + email window uses idx_study_signups_pack_email (signup-replace-schema.sql).
