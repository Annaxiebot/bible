-- The studied passage in the check-in email · 提醒邮件里的本周经文 (ADR-0004 §12)
--
-- Apply AFTER signups-schema.sql and study-packs-schema.sql: open the
-- Supabase dashboard → SQL editor → paste this whole file → Run.
-- Idempotent (ADD COLUMN IF NOT EXISTS; the backfill only fills rows whose
-- verses are still NULL), so re-running is safe. Applied live through the
-- management API on 2026-10-05.
--
-- 1. Columns. The leader's browser now writes the pack's verses into its
--    summary row (components/signup/packSummary.ts): verses = every verse
--    of the scripture section(s) as [{num, cuv, en}] — the bundled 和合本 +
--    BSB text copied from the pack, never regenerated (ADR-0003) — and
--    key_verse = the keyPhrase's verse number ("… (v.7)"), NULL when it
--    names none. NULL verses = a row summarised before this change; the
--    email then carries no passage block (send-checkins/templates.ts).
--    pack_summaries stays owner-only (RLS) and is read by the function with
--    the service role; public_signup_pack (remove-forms-schema.sql) and
--    checkin_context (checkin-optout-schema.sql) do NOT return these columns.

ALTER TABLE pack_summaries ADD COLUMN IF NOT EXISTS verses JSONB
  CHECK (verses IS NULL OR jsonb_typeof(verses) = 'array');
ALTER TABLE pack_summaries ADD COLUMN IF NOT EXISTS key_verse INT;

-- 2. One-time backfill from the owner's full pack in study_packs (same
--    owner only). The keyPhrase pattern matches packSummary.KEY_VERSE_PATTERN;
--    a key verse that is not in the passage stays NULL, as in the browser.

WITH scripture AS (
  SELECT sp.id, sp.leader_id, s.idx, s.section
  FROM study_packs sp
  CROSS JOIN LATERAL jsonb_array_elements(sp.pack->'sections') WITH ORDINALITY AS s(section, idx)
  WHERE s.section->>'kind' = 'scripture' AND jsonb_typeof(s.section->'verses') = 'array'
),
passage AS (
  SELECT sc.id, sc.leader_id,
         jsonb_agg(jsonb_build_object('num', (v.verse->>'num')::int, 'cuv', v.verse->>'cuv', 'en', v.verse->>'en')
                   ORDER BY sc.idx, v.vidx) AS verses,
         (array_agg(substring(sc.section->>'keyPhrase' from '\(v\.(\d+)\)\s*$') ORDER BY sc.idx)
            FILTER (WHERE sc.section->>'keyPhrase' ~ '\(v\.(\d+)\)\s*$'))[1]::int AS key_verse
  FROM scripture sc
  CROSS JOIN LATERAL jsonb_array_elements(sc.section->'verses') WITH ORDINALITY AS v(verse, vidx)
  GROUP BY sc.id, sc.leader_id
)
UPDATE pack_summaries ps
SET verses = p.verses,
    key_verse = CASE WHEN p.verses @> jsonb_build_array(jsonb_build_object('num', p.key_verse)) THEN p.key_verse END
FROM passage p
WHERE ps.pack_id = p.id AND ps.leader_id = p.leader_id AND ps.verses IS NULL;
