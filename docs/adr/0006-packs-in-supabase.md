# ADR-0006: Full study packs follow the leader across devices (2026-10-03)

Status: accepted. Owner decision (Chris): "one explicit leader sign-in, and
once signed in everything of that leader's work is in one place, on any
device."

## Context

A leader's full StudyPack lived only in the browser's IndexedDB
(`studypacks` store, `components/studypack/packSource.ts`). A pack prepared
on the laptop could not be opened on the living-room TV box; clearing site
data lost it. Supabase already held `pack_summaries` (ADR-0004 §3): the
small slice the sign-up page and `send-checkins` need. The leader also had
no single place listing their packs with sign-ups and shared answers.

## Decision

1. **`study_packs` table, owner-only.** `database/study-packs-schema.sql`:
   `id` (the pack id) primary key, `leader_id` → `auth.users` (cascade),
   `title`, `pack` JSONB (the whole validated pack), `created_at`,
   `updated_at` (touch trigger). RLS: SELECT/INSERT/UPDATE/DELETE only for
   `authenticated` where `auth.uid() = leader_id`; nothing for anon.
   Applied to the live project on 2026-10-03.
2. **Local-first.** IndexedDB stays the working copy; the editor, TV mode
   and import/export are unchanged. `components/newstudy/packSync.ts`
   mirrors it when a leader is signed in:
   - every save schedules a push of that pack 1.5 s after its last edit
     (`PACK_PUSH_DEBOUNCE_MS`); only packs whose `leaderId` is the
     signed-in uid are pushed;
   - on sign-in (after `claimLocalPacks` stamps this browser's ownerless
     packs) all rows are pulled and merged; local own packs the server
     lacks are pushed;
   - delete removes the row first, then the local copy.
   Signed out or Supabase unconfigured → nothing changes from before.
3. **Conflict rule: newer `updatedAt` wins.** `StudyPack.updatedAt`
   (optional ISO time, so older packs still parse) is stamped on every
   leader save. On merge the copy with the later time wins; a tie keeps the
   server copy (it is the same save). Packs saved before the field existed
   count as time 0, so any stamped copy beats them.
4. **Deletes propagate through `syncedAt`.** A local record carries
   `syncedAt` once the server is known to hold that exact copy (pushed or
   pulled). At the next merge, a local own pack with `syncedAt` that the
   server no longer has was deleted on another device, so it is dropped
   here too; one without `syncedAt` (never synced, or edited since) is
   pushed. No tombstone table.
5. **Loading.** `#/pack/<id>`, `#/new/<id>`, `#/leader/<id>` and
   `#/signup/<id>` resolve a `local-` id from IndexedDB, then (signed in)
   from `study_packs` (the copy is kept locally), else the "not found" line;
   every other id is still a committed pack under `public/packs/`.
6. **`pack_summaries` stays.** It remains the anon-path projection the
   sign-up page and `send-checkins` read, kept fresh by `useSummarySync`;
   `study_packs` is never readable by anyone but its owner.
7. **One sign-in, one home.** The landing nav carries one context-aware
   control: "带领者登录 Leader sign-in" (identity-only Google) signed out,
   the leader's first name → `#/leader` signed in. `#/leader` lists the
   leader's packs newest first with sign-up and shared-answer counts (two
   RLS-scoped queries for the whole leader) and Edit / Present / Sign-ups &
   responses / Sign-up QR links.
8. **Failures are typed and shown.** Every pull/push/delete failure becomes
   a `PackSyncFailure` (step + server message) on `PackSyncLine` (on
   `#/new` and `#/leader`); a failed delete keeps the local copy.

9. **Public sign-up projection (added 2026-10-03).** A member scans the QR
   on their own phone, signed out, with nothing in IndexedDB, so
   `#/signup/<local-id>` found nothing ("找不到这个查经包"). The anon-callable
   SECURITY DEFINER function `public_signup_pack(p_pack_id)`
   (`database/signup-pack-schema.sql`, applied live 2026-10-03) returns, as
   JSONB, exactly what the sign-up page reads (`SignupPack`,
   `components/signup/signupPack.ts`): `id`, `title`, `passageRef` (the
   header), `leaderId` (taken from the row's `leader_id`; the insert must
   carry it), `lifeMenu` (area + practice per row: the choices the member
   commits to), `feedbackFormUrl` and `feedbackFormEntries` (the thank-you
   link and its prefill field ids); NULL for an unknown id. Never verses,
   context, original language, cross references, discussion questions,
   reflection or closing lines, dates or timestamps. This narrows ADR-0004
   §3 ("the life menu never leaves the browser"): the life menu is now
   readable by anyone who has the pack id, which the QR already gives out,
   and ids are guessable (`local-<date>-<book><ch>`) — acceptable for one
   week's practice list, not for anything private. `loadSignupPack` tries
   `packSource` first (committed pack, this device, the signed-in leader's
   row) and calls the RPC only for a `local-` id still missing; failures
   are typed (`SignupPackError`: not-found / unconfigured / server /
   invalid) and shown. TV mode (`#/pack`) does not use the projection.
   A pack reaches members only after the leader's client has pushed it to
   `study_packs` (signed in, §2).

## Consequences

- Pack ids are `local-<date>-<book><chapter>`, globally unique only by
  convention. Two leaders who generate the same chapter for the same date
  collide on the `id` primary key: the second leader's push fails RLS and
  shows as a push failure (the same collision already exists for
  `pack_summaries`). One leader generating the same id on two devices gets
  newer-wins on one row. A per-leader id (or a composite key) is a later
  migration.
- Newer-wins is per pack and whole-pack: concurrent edits of the same pack
  on two devices keep only the later save. Acceptable for one leader
  preparing one study.
- A pack edited on device B (unsynced) after device A deleted it is pushed
  back at B's next sign-in: data is kept rather than lost.
- Members' phones read a leader pack only through the `public_signup_pack`
  projection (§9 below); `study_packs` itself stays owner-only.
- Clock skew between a leader's devices can pick the wrong winner when two
  saves are seconds apart.
- The e2e suite fakes the signed-in leader through a dev-only
  `window.__LEADER_E2E__` (ignored in production builds); the sync itself is
  covered by unit tests with a mocked client.
