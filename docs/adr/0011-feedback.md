# ADR-0011: Site feedback — one page, one table, one email (2026-10-06)

Status: accepted.

## Context

The owner wants a feedback link on every email and on the home page. Messages
must reach the owner's inbox (the address in the FEEDBACK_TO secret) without that address
appearing anywhere public: not in the page source, not in a `mailto:`, not in
an email footer. The page is public (members never sign in), so it is also a
spam target.

## Decision

1. **Page `#/feedback`** (`components/feedback/FeedbackPage.tsx`, routed in
   `landingRoute.resolveRootView` → `LandingGate`, lazy like the other member
   pages). Paper style with the shared `PaperHeader`. Heading "意见反馈 ·
   Feedback", a ≥ 20px textarea (max 2000, with a counter), an optional email
   ("想收到回复请留邮箱（可选）· Your email if you'd like a reply (optional)"),
   a hidden honeypot field (`website`: off-screen, `aria-hidden`,
   `tabIndex=-1`), and the shared `Pill` Send button. Success: "谢谢！我们会认真
   阅读 · Thank you — we read every message". Every failure has its own line
   (`feedbackStrings.FB_ERRORS`: each validation problem, rate limit, server,
   network, not configured).
2. **Context.** The link may carry `?from=email|landing|tv|member` and
   `&pack=<id>`. It is parsed once (`_shared/feedback.getFeedbackContextFromHash`),
   cleaned (unknown `from` and non-pack-shaped `pack` are dropped), shown
   nowhere, and stored with the message. `member` was added for the member
   pages' header link (not in the original list).
3. **Shared rules, one copy (R3).** `supabase/functions/_shared/feedback.ts`
   (pure, no imports) holds the route, the label, the limits, the honeypot
   name, the problem codes, `validateFeedback` and `isRateLimited`. The page,
   the function and the email footer all import it; the SQL CHECKs repeat the
   limits and a test pins them equal. Its `EMAIL_SHAPE` also replaced the
   sign-up form's private copy of the same regex.
4. **Storage.** `database/feedback-schema.sql` (idempotent, applied live
   2026-10-06 through the management API): `feedback(id uuid pk default
   gen_random_uuid(), message text not null CHECK 1..2000 chars, email text
   CHECK ≤ 200, context jsonb, ip_hash text, created_at)`, index
   `(ip_hash, created_at)`. RLS on with **no policy**, and `REVOKE ALL` from
   anon and authenticated: no client can read, write, update or delete. The
   owner reads rows in the Supabase dashboard (service role). Verified live:
   `rls true, policies 0`, anon/authenticated have no privilege; a rolled-back
   DO-block probe confirmed the CHECKs (empty, 2001 chars, 201-char email
   refused; 2000 accepted) and the table still has 0 rows.
5. **Edge function `feedback`** (`supabase/functions/feedback/`): `index.ts`
   wires Deno; the decision is `feedbackHandler.handleFeedback` (pure,
   vitest-driven with fakes): POST only (405) → validation (400 + problem
   code; a filled honeypot is refused before anything else) → salted SHA-256
   of the client IP (first `x-forwarded-for` hop; secret `FEEDBACK_SALT`; the
   raw IP is never stored) → rate limit, ≤ 5 rows per `ip_hash` in the last
   hour (429) → insert with the service client → **one** email. CORS through
   `_shared/cors.ts`. verify_jwt off (the page is public): deployed
   `--no-verify-jwt` and pinned in `supabase/config.toml`.
6. **Email.** Through the existing Resend sender
   (`send-checkins/senders.sendEmail` + `emailConfig`, imported across the
   function folders — one copy, R3): To = secret `FEEDBACK_TO` (the owner's
   inbox, never sent to the browser), From = `CHECKIN_FROM`, Reply-To = the
   writer's email when given (otherwise none — `CHECKIN_REPLY_TO` is not
   used), subject "意见反馈 · Feedback — scripturetolife.org", plain text +
   simple HTML with every user value through the check-in `escapeHtml`
   (`feedbackEmail.ts`).
7. **A send failure is not the writer's failure.** The row is already stored,
   so the function logs the error and still answers 200 with the row id and
   `emailed: false` (R5 comment in the handler). The owner sees every message
   in the dashboard either way.
8. **Links.** Every check-in email (welcome, tue/thu/weekend; not SMS) ends
   with "意见反馈 · Feedback" → `https://scripturetolife.org/#/feedback?from=email&pack=<id>`:
   in the text part as the line "意见反馈 · Feedback: <url>" between the stop
   line and the site line; in the HTML footer as a small link between the
   stop link and the scripturetolife.org link (no raw URL). The landing
   footer's link list ends with it (`?from=landing`); the nav has no overflow
   menu, so it is not added there (minimal UI). The member pages carry it once,
   in the shared `PaperHeader` (right of the wordmark, `?from=member`,
   ≥ 48px, not printed); `#/feedback` itself turns it off.

## Consequences

- The rate limit is count-then-insert, not atomic: a burst of parallel
  requests from one IP can exceed 5 by a few. Acceptable for a feedback form;
  the honeypot and validation stop the common bots.
- Behind a proxy that does not forward the client IP, everyone shares the
  `unknown` bucket (5 per hour site-wide). Supabase's edge does forward it.
- The live smoke test never created a row (preflight 204, GET 405, honeypot
  400, empty 400). The owner can send one real message from
  https://scripturetolife.org/#/feedback to test the email end to end.
- Secrets added: `FEEDBACK_SALT` (random, 32 bytes hex), `FEEDBACK_TO`.
