# ADR-0025: An anonymous New-study funnel, visible only to the owner (2026-10-23)

Status: accepted (owner decision E, 2026-10-23). Built
(database/funnel-schema.sql, components/stats/funnel*.ts,
components/admin/AdminFunnel.tsx); release pending (apply the SQL, then
deploy).

## Context

- Since 2026-10-23 every AI use needs sign-in (ADR-0007) and leaders can
  sign in with Google or email (ADR-0020). The owner wants to see where
  people drop off between opening New study and holding a generated pack:
  does sign-in lose them, which sign-in works, do generations fail, do
  people give up while waiting, and how long the wait is.
- ADR-0012 set the privacy rules for site numbers: aggregate counters, no
  identifiers, nothing that names a person or a group; the server decides
  what counts. ADR-0023 made the admin portal the one owner-only place for
  site-wide information.
- No cookies and no third-party analytics: the site has neither today, and
  the privacy page promises a non-commercial project.

## Decision

1. **Nine daily counters.** `funnel_daily (day, event, count, waits)`, one
   row per America/Los_Angeles calendar day × event (the owner's day, as the
   admin portal's "this month"). Events (`components/stats/funnelRules.ts`,
   pinned to the SQL by `database/__tests__/funnelSchema.test.ts`):
   `new_study_opened`; `signin_started_google` / `_email`;
   `signin_done_google` / `_email`; `generate_pressed`; `pack_ok`,
   `pack_failed`, `pack_abandoned`. The three outcomes also append the
   generation's wait in whole seconds to `waits`, for the median. Nothing
   else is stored: no user id, IP, token, pack or time of day.
2. **One writer, the server decides.** `log_funnel_event(p_event,
   p_wait_seconds)`, SECURITY DEFINER, `search_path` pinned, EXECUTE for
   anon + authenticated: an event outside the list raises 22023; an outcome
   needs a wait of 0..3600 s and the other events must send none (22023);
   the day is the server's; at most 5000 counts per event per day (further
   calls answer FALSE), which bounds the table and the waits array against
   a script. The upsert locks the day row, so concurrent counts are never
   lost. The table has RLS on, no policy, and no client privileges.
3. **What the browser counts** (`components/stats/funnel.ts`,
   `funnelSignIn.ts`):
   - *New study opened*: the New study page mounts on `#/new` (not an
     editor's `#/new/<id>`), signed in or out.
   - *Sign-in started*: a tap on "用 Google 登录", or "发送登录链接" with a
     well-formed address, on the shared sign-in card (New study, TV Ask AI,
     `#/setup`, the leader home). The method is noted in this browser for an
     hour (an emailed link opens a new tab).
   - *Sign-in finished*: the session appears while such a note exists
     (`startFunnelSignInWatch`, started in `index.tsx`), or an emailed code is
     accepted on the page — whichever is first, once. A session restored on
     load, or a sign-in from the personal app, counts nothing.
   - *Generate pressed* (also a study-guide PDF picked, which generates at
     once; Retry is a new attempt), then exactly one outcome per attempt,
     the first to happen: *ok* (a pack), *failed* (an error, or no usable passage in a
     guide), *abandoned* (Cancel, the tab closed or navigated away —
     `pagehide` — or New study left while generating). The wait is from the
     press to the outcome, clamped to 3600 s.
4. **Repeats count once — in the browser.** The page-open and sign-in events
   are sent at most once per 10 minutes per browser: the last-sent time per
   event is kept in localStorage (or the page's memory when storage is
   blocked) and never sent. Generation events are one per attempt by
   construction, so they are never dropped (otherwise pressed and outcomes
   would not add up). The owner offered a server-side alternative — a random
   per-browser token whose hash the server keeps for the window. It is not
   safer: anyone scripting the RPC can send a fresh token each time, so only
   the server's per-day ceiling bounds abuse either way, while honest
   browsers drop their own repeats equally well. Keeping it in the browser
   is simpler and sends strictly less (no token at all).
5. **Anonymous by construction.** The browser posts with the public anon key
   only — never the leader's session token — so even a signed-in leader's
   counts reach the database as `anon`. `fetch` with `keepalive` lets the
   pagehide count outlive the closing page. Dev builds and tests send only
   to the dev-only e2e base, so local runs never count on the live site. A
   failed count is silent (R5 (c) comment): it must never get in a leader's
   way.
6. **Where it shows.** The admin portal's Stats tab (ADR-0023), under the
   site totals: "新建查经漏斗 · New study funnel" for the last 14 days — the
   seven steps for the window (sign-ins split Google / email, each outcome
   with its median wait), then one row per day with counts, newest first
   (stacked cards on phones). `admin_funnel(p_days)` (1..92) calls
   `assert_site_admin()` first, so only site admins can read it; it returns
   one row per day × event and one per event with `day` NULL for the whole
   window (count and median). It reads on its own when the tab opens: a
   failure is one alert line and never blanks the rest of the portal.
7. **Privacy page.** One line under "我们收集什么 · What we collect", Chinese
   first: anonymous daily totals, never who, no cookies, no third-party
   analytics; the browser only remembers on the device when it last counted.

## Consequences

- The owner sees the funnel without SQL; nobody else can read it.
- Counts are approximate by design: a browser that blocks storage may count
  a reload twice; an emailed link opened on another device finishes a
  sign-in this browser never sees (not counted as finished); a phone that
  kills a tab without `pagehide` loses that abandonment. The figures are for
  spotting drop-offs, not for exact accounting.
- The counts start at zero on release; earlier visits were never recorded.
- Like every request to the site, a count passes Supabase's own gateway,
  whose request logs (kept by Supabase, as for all traffic) are never read
  for the funnel and never joined to it.
- A day reaching 5000 of one event stops counting it for that day (far above
  the 30-packs-a-day cap of ADR-0007; a sign of a script, not of use).

## Release

1. SQL: apply `database/funnel-schema.sql` (after `admin-portal-schema.sql`;
   additive, idempotent). Then the rolled-back probe `LIVE_DB=1 npx vitest
   run database/__tests__/funnel.live.test.ts`: as anon a valid count returns
   TRUE, an unknown event / an outcome without a wait or over 3600 s / a wait
   on a page-open raise 22023, the ceiling stops at 5000, `funnel_daily` and
   `admin_funnel` are closed; a non-admin gets AD403; the owner reads rows.
2. Site: deploy (New study, the sign-in card, the admin Stats tab, the
   privacy line).
3. Check: open New study signed out once, then the admin Stats tab shows
   "打开新建查经 · New study opened" ≥ 1 for today.
