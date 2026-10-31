# ADR-0026 — 分享链接 Member share link for a study pack

Status: accepted, built 2026-10-30. SQL: database/share-pack-schema.sql.

## Context

Some small groups have no projector or TV. Users suggested: let the leader
share a study link so members read the pack on their phones. study_packs is
owner-only under RLS (ADR-0006), pack ids are guessable, and the one anon
path (public_signup_pack) deliberately returns only the sign-up subset — so
a full member view needs a new, explicit opening.

## Decision

- The secret is a token, never the pack id: 22 random base64url chars,
  minted client-side on first share (packShare.ts `newShareToken`), stored
  in `study_packs.share_token` (unique partial index).
- Sharing is an explicit per-pack switch: `study_packs.shared` boolean. The
  one anon read path to a FULL pack is the SECURITY DEFINER RPC
  `public_shared_pack(p_token)`, which answers only while `shared` is true.
  Stop sharing → the link dies at once; the token is kept so re-sharing
  gives the same link. Only the owner can flip it (existing UPDATE policy).
- Member route `#/view/<token>` reuses TVPresentationView in member mode:
  read-only — no Ask AI (pill, hotkey, select-to-ask), no meeting-stats
  tracking (ADR-0012 counts leader presentations, not phones). Navigation
  stays swipe / arrow keys; the deck already fits phones (compact viewport).
- Leader UI: one 分享 Share action per row in 我的查经包 My packs →
  SharePackDialog (start/stop, link, QR via SignupQr, copy). Requires the
  pack synced to the signed-in leader (owner-only RLS makes this a
  precondition, and the dialog says so bilingually).

## Privacy boundary

The whole pack (verses, questions, reflection scaffold, life menu) becomes
readable by ANYONE holding the link, only after the leader's explicit act,
and revocably. No member identity is collected by the view; sign-ups stay on
the separate #/signup path (ADR-0013). public_signup_pack is unchanged.

## Consequences

- A leaked link exposes pack content until the leader stops sharing; the
  stable-token trade-off (same link across off/on) was chosen for group
  chats where re-sending a new link mid-week is a real cost. A future
  "新链接 New link" action can rotate the token if needed.
- Members load the pack once per open; a leader's later edits are seen on
  the member's next reload (no live sync — out of scope).
- 查看 view counter (owner asked 2026-10-31): `study_packs.share_views`,
  bumped by the anon VOLATILE RPC `public_shared_pack_viewed(p_token)` and
  shown as "查看 N 人 · N viewed" on the leader home counts line and in the
  share dialog. One count per member DEVICE (a localStorage guard in
  packShare.markSharedPackViewed), so it approximates people, not page
  loads; private-mode devices skip counting rather than count every reload.
  The counter is fire-and-forget: its failure never blocks the deck (R5).
