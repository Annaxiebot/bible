# ADR-0013: Sign-ups go through one server endpoint (2026-10-06)

Status: accepted.

## Context

A live security hole, confirmed on 2026-10-06. Members never sign in, so the
browser inserted into `study_signups` with the public anon key. Three
problems followed:

1. **Spoofed rosters.** The policy "Anyone may sign up for an owned pack"
   checked only `leader_id IS NOT NULL`. Anyone with the anon key (it ships
   in the page) could file sign-ups for any pack under any leader.
2. **Spam relay.** After its insert the caller could ask `send-checkins` for
   `{kind: 'welcome', signup_id}` — "the one anonymous path". A script could
   insert a row per address and have our domain mail thousands of strangers.
   Resend would block the domain, and every member's check-ins with it.
3. **Retiring someone else's sign-up.** `mark_replaced_signups(p_new_id)`
   was anon-callable: whoever knew a member's email and pack could file a
   row with that email and retire the member's sign-up.

As a stopgap the owner applied `database/signup-interim-guard.sql` live the
same day: the anon policy also required the pack's real owner (through a
SECURITY DEFINER helper, `signup_owner_matches`), and a BEFORE INSERT
trigger, `study_signups_rate_guard`, capped sign-ups per pack per hour and
per pack + email per day.

## Decision

1. **One edge function, `signup`, does the whole sign-up**
   (`supabase/functions/signup/`). It runs without a JWT (members never sign
   in): deployed `--no-verify-jwt`, pinned in `supabase/config.toml`, CORS
   through `_shared/cors.ts`. `index.ts` wires Deno and the service client;
   the decision is `signupHandler.handleSignup` (pure, vitest-driven with
   fakes), in this order:
   1. POST only (405).
   2. Validation (400 + a problem code + its bilingual line). The rules live
      in `supabase/functions/_shared/signup.ts`: at least one practice, at
      most 20, each text ≤ 300; name 1–100; email required, ≤ 200,
      `EMAIL_SHAPE`; phone optional, E.164-ish after `normalizePhone`; own
      version ≤ 500; `consent` a boolean. The page imports the same module
      for instant feedback, and `signupStrings` re-exports its lines (one
      copy, R3).
   3. Salted SHA-256 of the client IP (`_shared/clientIp.ts`, moved out of
      the feedback function, which now imports it). Secret `IP_HASH_SALT`;
      unset → 500. Stored as `study_signups.ip_hash`
      (`database/signup-ip-hash-schema.sql`); the raw IP never is.
   4. Per-IP cap: at most 60 sign-ups per `ip_hash` per rolling hour (a
      whole group on one church Wi-Fi shares an address). 429 with a
      bilingual line.
   5. The pack from `study_packs` by id (service role): unknown → 404.
      `leader_id` and `pack_title` come from that row, never from the body.
   6. Every chosen practice must be a row (same area, same text) of the
      pack's first `lifeMenu` section — the same extraction
      `public_signup_pack` makes — else 400.
   7. Insert with a server-made uuid, `ip_hash`, locale `zh`, the practice
      columns (`practiceColumns`), `practice_note`, `consent_checkins`.
      **The rate-guard trigger stays** and also fires on this service-role
      insert. It is the one copy of the per-pack (60 per hour) and per-pack
      + email (5 per day) caps; its refusal (SQLSTATE `P0001`) becomes a 429
      carrying the trigger's own bilingual message. The function does not
      repeat those caps.
   8. `mark_replaced_signups(new id)` with the service client. A failure
      still answers 200 (the row is stored) with `replace: 'failed'` and the
      reason; the page shows it under the thank-you.
   9. The welcome: a server-to-server POST to `send-checkins` with
      `x-checkin-secret: CHECKIN_CRON_SECRET` (the trusted-caller header) and
      the anon key for the gateway. A failure answers 200 with
      `welcome: 'failed'` and the reason; a deliberate skip (site paused,
      check-ins unticked) is `welcome: 'skipped'`.
   10. Reply `{ id, replaced, replace, replace_message?, welcome,
       welcome_message? }`.
2. **The doors are closed.**
   - `send-checkins` refuses an anonymous welcome with 403
     (`trust.welcomeCallerProblem`); the welcome window check stays.
   - `database/signup-endpoint-schema.sql`: drops the anon INSERT policy and its
     helper `signup_owner_matches` (only that policy used it); revokes INSERT
     on `study_signups` from anon and authenticated; makes
     `mark_replaced_signups` executable by `service_role` only.
     `signups-schema.sql` no longer creates the policy and
     `signup-replace-schema.sql` no longer grants anon, so a fresh install is
     safe; `signup-interim-guard.sql` now holds only the trigger.
3. **The browser makes one call.** `signupClient.submitSignup` invokes
   `signup` with what the member typed and chose — no `leader_id`, title or
   id — and maps the reply onto the existing thank-you (replace and welcome
   lines). The old `insertSignup`, `markReplaced`, `newSignupId`,
   `toInsertPayload`, `SignupInsert` and `welcomeEmail.ts` are deleted.
4. **Tests mirror the server.** The e2e mock runs the real `handleSignup`
   over in-memory tables; the rate-guard fake reads its caps and messages
   from the trigger's SQL (`tests/utils/signupRateGuard.ts`); a direct
   insert, the replace RPC and an anonymous welcome get the live refusals.

## Consequences

- **Release order** (each step leaves the site working). The column is
  split from the door-closing SQL for this reason: the function needs
  `ip_hash` before the site switches, and the doors may close only after.
  1. Apply `database/signup-ip-hash-schema.sql` (adds a nullable column and
     an index; the live page is unaffected).
  2. `supabase secrets set IP_HASH_SALT=<long random>`
     (`CHECKIN_CRON_SECRET` is already set; `SUPABASE_URL`,
     `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected).
  3. `supabase functions deploy signup --no-verify-jwt`.
  4. Deploy the site (the page now calls `signup`). Check one real sign-up:
     the thank-you, the welcome email, and the row's `ip_hash`.
  5. `supabase functions deploy send-checkins --no-verify-jwt` (anonymous
     welcome closed). After step 4, so the old page does not lose its
     welcome while it is still live.
  6. Apply `database/signup-endpoint-schema.sql` (closes the direct insert
     and the replace RPC). A page still cached from before step 4 now gets
     a visible "提交失败 · Submission failed" and works after a reload.
- The anonymous welcome is gone. Only the `signup` function, pg_cron and the
  owner's shell (all holding `CHECKIN_CRON_SECRET`) can ask for one.
- A pack can be signed up for only once it is in `study_packs`. Leader packs
  get there when saved while signed in (ADR-0006). A committed public pack
  that has a `leaderId` but no `study_packs` row now gets 404; the only
  public pack today is the demo pack, which has no leader.
- The function treats every `P0001` from the insert as the rate guard's
  refusal. Nothing else on `study_signups` raises `P0001` today; a future
  trigger that does must use its own SQLSTATE.
- `ip_hash` is readable by the pack's leader (row-level SELECT). It is a
  salted hash and the salt is a function secret, so it identifies no one.
