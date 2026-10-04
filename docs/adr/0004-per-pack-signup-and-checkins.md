# ADR-0004: Per-pack sign-up and automated check-ins (2026-10-02)

Status: accepted.

## Context

Every pack carried one static QR (`public/packs/signup-qr.png`) pointing at a
single Google Form. Sign-ups could not be tied to a study, the leader had to
read a spreadsheet, and the Tue/Thu check-ins (ADR-0003 §17) were sent by
hand. Supabase was already in the stack (auth, sync, `ai-chat` edge function).

## Decision

1. **A pack has an owner.** `StudyPack.leaderId` (optional) is the Supabase
   auth uid of the leader; every save/import while signed in stamps it
   (`stampLeader`). A pack without it is a demo pack: no QR, no sign-up page,
   no check-ins — the committed sample pack is demo-only.
2. **Sign-up is per pack, in the app.** `#/signup/<packId>` (components/signup/)
   loads the pack through `packSource.loadPack` and inserts into
   `study_signups` with the anon key, carrying the pack's `leader_id`. RLS:
   anon/authenticated may INSERT only when `leader_id` is set; a leader may
   SELECT/DELETE only rows where `auth.uid() = leader_id` (same shape as the
   notes/annotations policies); no UPDATE. `checkin_sends` is scoped the same
   way. Schema and policies: `database/signups-schema.sql`.
3. **The server sees only a pack summary.** Packs live in the leader's
   browser, so the owner's client upserts `pack_summaries` (title, passage,
   the three reflection lines, the closing question) whenever it opens the
   leader page, shows the QR, or saves the pack (`packSummary.ts`, one
   helper). The edge function reads that row with the service role and falls
   back to the public pack JSON only for committed packs. Verses, context,
   questions and the life menu never leave the browser. (Superseded by
   ADR-0006: full packs sync owner-only to study_packs, and §9 there makes
   the title, passage and life menu public for the sign-up page.)
4. **The QR is drawn in the browser from the pack id**
   (`signupRoute.currentSignupUrl` → `SignupQr`, the `qrcode` package, SVG).
   The pack JSON stores no image or URL; `buildSlides` attaches `signupUrl`
   to the qr slide. One dependency added (`qrcode`, ~no runtime weight beyond
   the encoder); its types live in `types/qrcode.d.ts`.
5. **Check-ins are an edge function + pg_cron.** `send-checkins` renders a
   two-line bilingual message plus the pack link from the summary's
   reflection lines (tue/thu/weekend = lines 0/1/2), emails through Resend,
   SMS through Twilio behind `CHECKIN_SMS_ENABLED`, writes one `checkin_sends`
   row per attempt. It verifies the pack ↔ leader pairing from the rows
   (`verifyLeader`); only a trusted caller (header `x-checkin-secret` = secret `CHECKIN_CRON_SECRET`; pg_cron or the owner) may address the member list; any
   other caller must be the owner (JWT uid = `leaderId`) and is forced into a
   dry run to its own `test_to`. pg_cron fires two UTC lines per kind
   (PST/PDT) and the function sends only in the 09:00 LA hour.
6. **The leader list is in the app too.** `#/leader/<packId>` reuses the
   existing Supabase session and AuthPanel and shows only the owner's rows
   (RLS plus a client-side uid filter); someone else's pack gets "这不是你的
   查经包 · Not your pack". CSV export; a dry-run test send. Reached from
   "报名 Sign-ups" on each pack in `#/new`.

## Consequences

- Deployment steps the owner must do by hand are listed at the top and bottom
  of `database/signups-schema.sql` (apply SQL, deploy function, secrets,
  pg_cron/pg_net, Resend domain, Twilio verification).
- The pure parts of the function (`templates.ts`, `recipients.ts`,
  `senders.ts`) are Node-compatible and covered by vitest; only `index.ts`
  touches Deno. `PACK_SCHEMA_VERSION` is duplicated there (Deno cannot import
  the app's extensionless modules) and pinned equal by a test.
- Member data stays limited to name/phone/email/consent per pack; reflections
  never leave the device (ADR-0003 §17 unchanged).

## Addendum (2026-10-02): commitment, feedback, claim, and the feedback form

7. **A sign-up is a commitment, not a contact form.** The first step of
   `#/signup/<packId>` is "我本周的操练 My practice this week": the pack's
   seven life-menu rows as large choices (any number, at least one — see
   the 2026-10-04 amendment below; an optional own version), then the
   contact step. The row carries
   `practices/practice_area/practice_text/practice2_*/practice_note`. Check-ins
   restate the member's practices ("你选的操练：…") and link to the
   member's check-in page `#/checkin/<signupId>[/<kind>]`
   (components/checkin/). **Token rule:** the signup uuid is the member's
   only credential — unguessable, no uid or pack id in the URL. The page
   reads its context through `checkin_context()` (SECURITY DEFINER; title,
   name, practice, prompt lines, form URL — never phone or email) and shares
   an answer only through `share_checkin_answer()` (SECURITY DEFINER copies
   pack_id/leader_id from the signup row; nothing client-supplied decides
   ownership). `checkin_answers`: leaders SELECT `auth.uid() = leader_id`;
   no INSERT/UPDATE/DELETE policy for app roles. "只记在我的手机 Keep private"
   writes localStorage only (ADR-0003 §17: private by default; sharing is
   the member's explicit tap). The leader page shows 承诺 Commitments (who
   chose what, counts per area) and 反馈 Shared feedback (by kind, newest
   first, answered-vs-signed-up) — next Friday's closing material; CSV
   includes practice and the latest shared answer per kind.
   Right after a sign-up with an email the browser asks the edge function
   for kind `welcome` (the one anonymous path: the signup must exist and be
   younger than 10 minutes, `recipients.welcomeAllowed`); the message
   restates the practice and carries the check-in link.
8. **Unclaimed vs demo.** A pack without `leaderId` is a *demo* only when it
   is public (id not `local-`). A LOCAL pack without a leader is
   *unclaimed*: it exists only in this browser, so whoever signs in here
   owns it. The TV qr slide and `#/signup` show "登录以启用报名 · Sign in to
   enable sign-up" with the app's Google sign-in; the sign-in returns to the
   same hash (`services/authReturnHash`), and the one auth listener
   (`claimLocalPacks.installClaimOnSignIn`, mounted by LandingGate) stamps
   every leaderless local pack with the uid and syncs its summary; pages
   re-read the pack on the claim event, so the QR appears without a reload.
   `packSource.packSignupState` is the single decision helper.
9. **Feedback vehicle: the built-in check-in page by default; Google Forms
   is an explicit opt-in.** (Amended 2026-10-02, owner decision: Supabase is
   the single backend. The first cut of this section auto-created a Google
   Form per pack and had the ordinary sign-in request `forms.body`; that is
   withdrawn.) A pack with no `feedbackFormUrl` uses `#/checkin/<signupId>`
   for every check-in link (welcome, scheduled sends) — silently, with no
   notice, because it is the default, not a fallback. The ordinary Google
   sign-in (AuthPanel, leader page, sign-up claim) requests identity only
   (`openid email profile`, `googleForms.GOOGLE_SIGN_IN_SCOPES`): no
   sensitive scope, so no Google app verification and no Testing-mode
   test-user list for leaders who never use Forms. The Forms scope with
   offline access + consent is requested only by
   `authManager.signInWithGoogle({ withForms: true })`, whose single caller
   is the editor's "连接 Google 表单（可选）Connect Google Forms (optional)"
   button (`useFeedbackForm.connect`; a source-scan test pins the single
   caller). Connect creates the form in the leader's own Google account
   (five items: name; practice as a choice from the pack's seven practices
   + Other; what I did; what changed in me; OK to share) with the session's
   `provider_token` (browser session only; never logged, never sent to our
   backend); without a token it remembers the pack id, re-runs the sign-in
   with the Forms scope, returns to the same editor and creates the form
   then. The responder link is stored as `StudyPack.feedbackFormUrl` and in
   `pack_summaries` (`feedback_form_url`, `feedback_form_entries`). Pasting
   an existing form link (generation form, with "用于我所有的查经 · Use for
   all my studies" as the leader's default; or the editor's per-pack field)
   needs no Google permission. Typed failures of the opt-in (permission not
   granted / Forms API not enabled / API error / network) are a bilingual
   notice naming the cause; the pack keeps the built-in page; never a
   throw. Prefill: `?usp=pp_url&entry.<id>=<value>` with the ids the leader
   pastes; the API's hexadecimal questionIds are not documented as
   convertible to entry ids, so created forms are linked plain. Owner setup
   (only if a leader opts in): `docs/guides/google-forms-setup.md`. Landing
   and setup copy do not promise Google Forms. Reading responses back via
   the API (another sensitive scope) is not planned; the built-in page
   already shows shared answers on the leader page.
10. **A pack is never lost.** The editor auto-saves (first sight at once,
    edits after 500 ms, flush on Back/Preview/unmount; `useAutoSave`), the
    URL follows the pack (`#/new/<packId>`, reload restores), and TV mode
    opened from the editor exits back to it (`tvReturn`, keyed by pack id;
    a pack opened directly still exits to the app).
11. **Email headers are secrets, not code.** `CHECKIN_FROM` (default: the
    `CHECKIN_FROM_EMAIL` constant) and `CHECKIN_REPLY_TO` (optional; sets
    Resend's `reply_to`, e.g. an agent mailbox) are read in `index.ts` and
    passed to the pure `senders.emailConfig`/`sendEmail`. Secrets list:
    `RESEND_API_KEY`, `CHECKIN_FROM`, `CHECKIN_REPLY_TO`, `CHECKIN_SMS_ENABLED`,
    `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `DRY_RUN`,
    `CHECKIN_CRON_SECRET` (the trusted-caller header value, see §6)
    (runbook: `database/signups-schema.sql`). SMS is unaffected.

**Amendment (2026-10-04): any number of practices.** The commitment step
is a multi-select: a tap toggles a row, any number may be chosen (at least
one to continue), kept in tap order; chosen rows show a check and the gold
border. Storage: `study_signups.practices JSONB` — an array of
`{area, practice}` in that order (`database/signup-practices-schema.sql`,
CHECK: NULL or a JSON array). The insert still writes `practice_area/
practice_text` (= first) and `practice2_area/practice2_text` (= second) so
older readers keep working; rows from before the column have `practices`
NULL. One reader, `supabase/functions/send-checkins/practices.ts` (pure;
imported by the app and the edge function), returns the full list, falling
back to the legacy pair. `practice_note` (the own version) replaces the
FIRST practice's text wherever practices are shown, as before. Every reader
shows all practices: the leader roster (one line each), the per-area counts
(each chosen area once per member — also the counts ADR-0008 sends), the
CSV (`practices` column), `checkin_context()` (now also returns
`practices`; it moved to the new file, dropped and re-created because its
return type changed), the check-in page, and the welcome + Tue/Thu/weekend
messages (one "你选的操练：…" line per practice). The Google Form prefill
still carries only the first practice.

**Fix (2026-10-04): the anon insert never reads its row back.** Anon has
no SELECT policy on `study_signups` (members must not read rows), so
`INSERT ... RETURNING` (supabase-js `.insert().select()`) failed RLS and
every member sign-up was rejected. The browser now makes the uuid
(`signupClient.newSignupId`), sends it as `id`, inserts with
return=minimal, and uses that id as the check-in token. No anon SELECT
policy was added. The e2e mock answers a `Prefer: return=representation`
insert with the same 42501 error, so a client that reads back cannot pass.

### Consequences (addendum)

- `database/signups-schema.sql` gained columns, `checkin_answers`, two
  SECURITY DEFINER functions, the `welcome` kind; re-run the file (idempotent).
- The edge function's `renderCheckin` takes a member context (name, signup
  id, practice); `prefillFormUrl` is duplicated in Deno and pinned equal to
  the app's copy by a test.
