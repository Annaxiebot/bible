# ADR-0009: Check-in opt-out — three levels of "stop" (2026-10-04)

Status: accepted.

## Context

The automatic Tue/Thu/weekend check-ins (ADR-0004 §5) were about to be
switched on. Until now the only way to stop them was the sign-up's
`consent_checkins` box, chosen once at sign-up. A member could not stop
later, a leader could not stop one person, and the owner could not stop the
whole system without unscheduling pg_cron. Mail providers (Gmail, Apple
Mail) also expect a one-click unsubscribe header on bulk-style mail.

## Decision

Three levels, from the narrowest to the widest. Schema:
`database/checkin-optout-schema.sql` (idempotent, applied live 2026-10-04).
Shared names and pure helpers: `supabase/functions/send-checkins/optout.ts`
(imported by the app and the edge function, R3).

1. **Member, per sign-up, per study.**
   `study_signups.unsubscribed_at TIMESTAMPTZ` + `unsubscribed_by TEXT`
   (`'member' | 'leader'`, CHECK). `unsubscribe_signup(p_id)` /
   `resubscribe_signup(p_id)` are SECURITY DEFINER, anon-callable, return
   whether the token matched. **Knowing the signup id is the authority** —
   the same model as `checkin_context` / `share_checkin_answer` (ADR-0004
   §7). Both act on "this person in this pack": the row and every row with
   the same `pack_id` + `lower(trim(email))` (the replace key), so a link in
   an email sent before a re-sign-up still stops the live row. A stop keeps
   its first time and records `'member'`.
   - Page `#/checkin/<id>/stop` (`components/checkin/StopPage.tsx`, route in
     `checkinRoute.ts`, wired in `landingRoute` / `LandingGate`): one large
     "停止提醒 · Stop these emails" button → "已停止本次查经的提醒 · Reminders for
     this study are stopped" + "恢复 · Resume". No sign-in.
   - The check-in page shows a small link to it; when stopped
     (`checkin_context` now returns `unsubscribed_at`; its single definition
     moved to the new file, dropped and re-created) it shows that state with
     Resume.
   - Every member email (welcome + tue/thu/weekend) ends with
     "不想再收到？退订 · Stop these emails: <stop page>"
     (`templates.stopLine`). The leader's test email has no signup id, so no
     stop line.
   - **One-click (RFC 8058).** `senders.resendBody` adds Resend `headers`:
     `List-Unsubscribe: <…/functions/v1/send-checkins?unsubscribe=<id>>` and
     `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. `send-checkins`
     answers that URL (`optout.handleOneClick`): POST only (a GET, e.g. a
     link scanner, is 405 and never unsubscribes), id must be a uuid and the
     body exactly `List-Unsubscribe=One-Click` (400), unknown id 404, marked
     200. It calls `unsubscribe_signup` with the service role.
   - **verify_jwt.** Mail providers send no JWT. `send-checkins` was already
     deployed with verify_jwt off (live check: `verify_jwt: false`, v15), and
     every other path enforces its own caller: a list send needs the
     `x-checkin-secret` header (trust.ts); a leader test needs a JWT whose
     uid owns the pack (`callerUid`) and is forced into a dry run to
     `test_to`; the welcome needs a row younger than the welcome window. So
     the endpoint lives in `send-checkins` (no separate function), deployed
     `--no-verify-jwt`, pinned in `supabase/config.toml`
     (`[functions.send-checkins] verify_jwt = false`) so a later deploy
     without the flag cannot silently break one-click.
   - Senders skip a stopped row as `'unsubscribed'`
     (`recipients.selectRecipients`; precedence: replaced, unsubscribed,
     no-consent, contact). The welcome goes through the same selection, so a
     stopped row gets no welcome. Skips are returned in the response's
     `skipped` list, as before; `checkin_sends` records attempts only (it
     never recorded skips).
2. **Leader stops/resumes one person.** Each live roster row
   (`components/leader/LeaderOptOut.tsx` `SubscriptionCell`, in the
   check-ins column) shows "停止提醒 · Stop emails", or "已退订 ·
   Unsubscribed" with who. Writes go through
   `leader_set_signup_subscription(p_id, p_stop)` (SECURITY DEFINER,
   `auth.uid()` must equal the row's `leader_id`, 42501 otherwise;
   authenticated only — anon is revoked explicitly because Supabase's
   default privileges grant it directly). **Who may resume:** a leader may
   stop anyone, but may not resume a member who stopped themselves — the
   function raises SQLSTATE `STL01`, the client maps it to
   `MemberChoiceError`, and the cell shows "成员本人已退订 · The member
   unsubscribed themselves" with no Resume. A leader's stop of an
   already-stopped member keeps `'member'`. The member may resume any stop
   of their own rows from their link (the link holder is the email owner;
   their choice wins).
3. **Pause.**
   - Per study: `pack_summaries.checkins_paused BOOLEAN NOT NULL DEFAULT
     false`, toggled on the roster page ("暂停本次查经的提醒 · Pause this
     study's reminders", `PauseToggle`) under the existing owner UPDATE
     policy. The summary sync never sends this column, so re-opening a pack
     cannot un-pause it (pinned by a test). `send-checkins` skips a paused
     pack for tue/thu/weekend and returns `{ skipped: 'paused' }` — the
     leader's dry-run test included. **The welcome still goes while a pack
     is paused:** the member has just signed up and expects the
     confirmation; pausing is about the mid-week rhythm, not about
     acknowledging a sign-up.
   - Site-wide: secret `CHECKIN_PAUSED=1` makes `send-checkins` send nothing
     — scheduled, manual, leader test and welcome — and return
     `{ skipped: 'paused-site' }`. The one-click endpoint still works while
     paused. Flip with `supabase secrets set CHECKIN_PAUSED=1` / `=0`
     (runbook in `database/signups-schema.sql`). The decision is one pure
     helper, `optout.pauseSkip(kind, sitePaused, packPaused)`.

## Consequences

- Apply `database/checkin-optout-schema.sql` after the other sign-up files;
  `checkin_context` is defined only there now (a test fails if another SQL
  file defines it).
- The roster's Stop/Resume and pause are unit-tested only: the leader page
  uses the app's real Supabase client, which the e2e dev server does not
  configure. The member's stop page and the check-in link are e2e-tested
  with fakes that enforce the SQL functions' contracts.
- Trade-off: anyone holding a member's link can stop or resume that
  member's reminders — the same reach the link already gives to their
  check-in page and shared answers.
