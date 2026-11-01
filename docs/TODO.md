
## CI e2e red since 2026-10-23 (found 2026-11-01)
The Tests workflow's e2e job fails on every push since f0d66b4a was the last
green run. Local Playwright passes (225). CI-only failures: leader-home.spec:40
(lh-counts not found), signup.spec:263, tv-presentation.spec:97/:105 (QR lines).
Suspects: CI lacks the Supabase env the specs now rely on, and
public/packs/2026-10-02-john3.json is gitignored on purpose (never commit it).
Two stale specs from 2026-10-31 (ns-save, scroll-to-answer-start) already fixed
in dbe1f31b; the rest needs a CI-env reproduction.
