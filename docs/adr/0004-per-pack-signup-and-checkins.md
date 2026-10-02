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
   questions and the life menu never leave the browser.
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
   (`verifyLeader`); only the service role may address the member list; any
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
