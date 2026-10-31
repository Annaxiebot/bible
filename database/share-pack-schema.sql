-- Member view of a shared study pack · 查经包分享链接 (ADR-0026)
--
-- Apply AFTER study-packs-schema.sql: Supabase dashboard → SQL editor →
-- paste this whole file → Run. Idempotent (IF NOT EXISTS / CREATE OR
-- REPLACE / REVOKE+GRANT), so re-running is safe.
--
-- Why: some small groups have no projector or TV. The leader taps 分享
-- Share on a pack, gets a link + QR, and members open the FULL pack on
-- their phones — read-only, no account.
--
-- PRIVACY BOUNDARY (ADR-0026): study_packs stays owner-only under RLS; the
-- ONE anon path to a full pack is public_shared_pack(p_token), and it
-- answers only when the owning leader has explicitly turned sharing on
-- (shared = TRUE). The token is a 22-char random secret generated client
-- side (packShare.ts) — never the guessable pack id (ADR-0006 notes ids
-- collide and can be guessed). Turning sharing off (shared = FALSE) revokes
-- the link immediately; only the owner can flip it (the UPDATE policy in
-- study-packs-schema.sql already covers these columns).

ALTER TABLE study_packs ADD COLUMN IF NOT EXISTS share_token TEXT;
ALTER TABLE study_packs ADD COLUMN IF NOT EXISTS shared BOOLEAN NOT NULL DEFAULT FALSE;

-- One pack per token; partial so the many NULLs cost nothing.
CREATE UNIQUE INDEX IF NOT EXISTS idx_study_packs_share_token
  ON study_packs(share_token) WHERE share_token IS NOT NULL;

-- The full pack JSON for a live share token; NULL when the token is unknown
-- or sharing is off. STABLE + SECURITY DEFINER with a pinned search_path,
-- mirroring public_signup_pack (remove-forms-schema.sql). The length guard
-- refuses trivially short probes outright.
CREATE OR REPLACE FUNCTION public.public_shared_pack(p_token TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT sp.pack
  FROM study_packs sp
  WHERE length(p_token) >= 16
    AND sp.share_token = p_token
    AND sp.shared;
$$;
REVOKE ALL ON FUNCTION public.public_shared_pack(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_shared_pack(TEXT) TO anon, authenticated;
