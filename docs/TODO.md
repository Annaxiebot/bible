
## CI e2e — FIXED 2026-11-01 (was red since 2026-10-23)
The Tests workflow's e2e job fails on every push since f0d66b4a was the last
green run. Local Playwright passes (225). CI-only failures: leader-home.spec:40
(lh-counts not found), signup.spec:263, tv-presentation.spec:97/:105 (QR lines).
Suspects: CI lacks the Supabase env the specs now rely on, and
public/packs/2026-10-02-john3.json is gitignored on purpose (never commit it).
Two stale specs from 2026-10-31 (ns-save, scroll-to-answer-start) already fixed
in dbe1f31b; the rest needs a CI-env reproduction.


## Usability review follow-ups (2026-11-01, verified claims only)
- Phone hero: trim the intro so 新建查经 / Explore sample land in the first screen.
- Verse-ref popups are hover-only; dotted underline invites a tap/click that
  does nothing — open the popup on click/tap too.
- Check sample slides for clipped English scripture tails at presentation size.
- Stats strip: "31,100+" was misread as "31 languages, 100+ studies" — keep the
  value and unit visually joined.
- A one-line "who runs this" note near the footer privacy link.
Done from the reviews: privacy.html linked from the footer; SPA 404 fallback.
Refuted: "Vibe Studio/Notability/voice" (not this site); unsourced stats (ours
are honest counts); missing meta/OG (description + og:description exist).
