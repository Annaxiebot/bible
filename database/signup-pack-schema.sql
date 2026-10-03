-- The member's view of a leader pack · 报名页可见的查经包投影 (ADR-0006)
--
-- Apply AFTER study-packs-schema.sql: open the Supabase dashboard → SQL
-- editor → paste this whole file → Run. Idempotent (CREATE OR REPLACE +
-- REVOKE/GRANT), so re-running is safe. Applied to the live project through
-- the management API on 2026-10-03.
--
-- Why: a member scans the TV QR on their own phone, signed out, and opens
-- #/signup/<packId>. A leader-generated pack ("local-...") lives in the
-- leader's IndexedDB and in study_packs, which is owner-only — so the phone
-- found nothing. This function is the one anon path into study_packs.
--
-- PRIVACY BOUNDARY: it returns only what the sign-up page reads
-- (components/signup/signupPack.ts, SignupPack): id, title, passageRef,
-- leaderId (the insert must carry it; RLS on study_signups requires it),
-- lifeMenu (area + practice per row — the choices the member commits to),
-- feedbackFormUrl and feedbackFormEntries (the thank-you link and its
-- prefill field ids). Never the verses, context, original language, cross
-- references, discussion questions, reflection or closing lines, dates or
-- timestamps. NULL when the id is unknown. SECURITY DEFINER with a pinned
-- search_path; callable by anon and authenticated only.

CREATE OR REPLACE FUNCTION public.public_signup_pack(p_pack_id TEXT)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT jsonb_build_object(
    'id', sp.id,
    'title', sp.title,
    'passageRef', sp.pack->>'passageRef',
    'leaderId', sp.leader_id,
    'lifeMenu', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('area', r.item->>'area', 'practice', r.item->>'practice') ORDER BY r.idx)
      FROM jsonb_array_elements(menu.menu_rows) WITH ORDINALITY AS r(item, idx)
    ), '[]'::jsonb),
    'feedbackFormUrl', sp.pack->>'feedbackFormUrl',
    'feedbackFormEntries', CASE WHEN sp.pack ? 'feedbackFormUrl' THEN sp.pack->'feedbackFormEntries' END
  )
  FROM study_packs sp
  LEFT JOIN LATERAL (
    SELECT CASE WHEN jsonb_typeof(s.section->'rows') = 'array' THEN s.section->'rows' ELSE '[]'::jsonb END AS menu_rows
    FROM jsonb_array_elements(sp.pack->'sections') WITH ORDINALITY AS s(section, idx)
    WHERE s.section->>'kind' = 'lifeMenu'
    ORDER BY s.idx
    LIMIT 1
  ) menu ON TRUE
  WHERE sp.id = p_pack_id;
$$;
REVOKE ALL ON FUNCTION public.public_signup_pack(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_signup_pack(TEXT) TO anon, authenticated;
