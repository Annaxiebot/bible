# ADR-0012: Site-wide usage counters — totals only, private until the site is big enough (2026-10-06)

Status: accepted.

## Context

The owner wants to show how the site is used — study packs made, group
meetings held, "living the Word" (practices chosen, check-ins shared),
leaders — to encourage more use. Two constraints: no names or per-group
details may leak (ADR-0003 §17), and small numbers shown publicly look
discouraging and say little. Until now nothing recorded a meeting: TV mode
was purely client-side.

## Decision

1. **One aggregate RPC.** `public.site_stats() RETURNS jsonb`
   (`database/site-stats-schema.sql`), SECURITY DEFINER, `search_path`
   pinned, EXECUTE for anon + authenticated, revoked from PUBLIC. Keys
   (pinned equal to `components/stats/statsRules.SITE_STATS_KEYS`):
   - `packs` — rows in `study_packs` (packs saved to a leader's account);
   - `leaders` — distinct `leader_id` with ≥ 1 pack (stands for groups too);
   - `meetings` — rows in `presentation_sessions` (rule 2);
   - `signups` — live `study_signups` (`replaced_at IS NULL`, ADR-0004);
   - `practices` — practices chosen on live sign-ups: the `practices` array
     length; an older row counts its legacy practice columns, else 1;
   - `checkins_shared` — rows in `checkin_answers`;
   - `as_of` — when it was read.
   Totals only: no GROUP BY, no per-pack or per-leader value, no text column
   (pinned by `database/__tests__/siteStatsSchema.test.ts`). Anyone holding
   the anon key can call it; that is acceptable because the totals identify
   no one.
2. **What a meeting is.** A TV presentation of a pack open for **10 minutes
   of visible time** (`MEETING_MIN_SECONDS = 600`). `useMeetingTracker`
   (`components/stats/`, used by `TVPresentationView`) accumulates time only
   while `document.visibilityState` is visible and calls
   `log_presentation(p_pack_id, p_seconds)` **once** per presentation. The
   landing demo pack (`SAMPLE_PACK_ID`) is never sent. A failed call is
   silent (R5 (c) comment): the counter must never disturb a meeting.
3. **The server decides what counts.** `log_presentation` (SECURITY DEFINER,
   anon + authenticated): seconds outside 600..21600 (6 h) raise 22023; a
   pack id that is not in `study_packs` returns FALSE (the demo pack,
   local-only packs and made-up ids never count — so nobody can inflate the
   public total by inventing ids); a pack that already has a row created in
   the last **2 hours** returns FALSE (reloads, a second screen in the same
   room); otherwise one row, `leader_id = auth.uid()` (NULL when the TV is
   not signed in), `started_at = now() - p_seconds`, `ended_at` NULL (the
   meeting is still going when it is logged), `duration_seconds = p_seconds`.
   A per-pack advisory lock makes the check-then-insert atomic.
   `presentation_sessions` has RLS on, no policy, and no privileges for anon
   or authenticated: nobody reads it through the API.
4. **Where it shows.** Signed-in leaders see "全站使用 · Site-wide" under My
   packs on `#/leader` (`components/leader/SiteStatsSection.tsx`): 查经包
   Study packs, 带领者 Leaders, 小组聚会 Meetings, 报名 Sign-ups, then under
   "活出神的话 · Living the Word": 选择的操练 Practices chosen, 分享的跟进
   Check-ins shared. Loading and failure are one quiet line each.
   The landing's honest-numbers section switches to the six live totals only
   when `leaders ≥ PUBLIC_STATS_MIN_LEADERS` (10, one constant in
   `statsRules.ts`). Below it, while loading, or on any failure the landing
   is exactly as before (the four honest figures).
5. **One call per session.** `siteStats.loadSiteStats` shares one promise
   across the landing and the leader home; a failure is not cached, so a
   later visit may retry.

## Consequences

- Meetings start at zero on 2026-10-06; earlier presentations were never
  recorded.
- A pack presented on a device that never saved it to an account (no
  sign-in) is not counted. Leaders who want their meetings counted sign in
  once; that is also what syncs their packs.
- A group that meets twice within 2 hours with the same pack counts once.
- The threshold is on leaders, not on packs or sign-ups: one very active
  leader cannot make the public numbers appear.
- Live on 2026-10-06 (migration applied twice, idempotent): `site_stats()` =
  packs 3, leaders 2, meetings 0, signups 4, practices 15, checkins_shared 2
  — far below the public threshold, so the landing is unchanged.
