# ADR-0023: A site admin portal, visible only to the site's owner (2026-10-11)

Status: accepted (2026-10-11). Owner decision: the list of leaders (and
similar site-wide information) must be visible only to the site's owner,
through an admin portal. Built (database/admin-portal-schema.sql,
components/admin/*); released 2026-10-11 (SQL applied, owner row
present, live probe passed).

## Context

- Leaders are people who signed in with Google (Supabase Auth). Today the
  owner can see who they are only in the Supabase dashboard (Authentication
  → Users) or by asking for a read-only database query; per-leader activity
  (studies, sign-ups) needs SQL.
- The landing and leader pages show only aggregate site statistics
  (ADR-0012); nothing on the site lists other leaders, and nothing should
  for anyone but the owner.
- Other owner-only information already exists in scattered places: the
  feedback rows (ADR-0011, read in the dashboard), AI usage per leader
  (ai_usage, ADR-0007 quotas).

## Decision

### Who is an admin
- A table `site_admins (user_id uuid primary key references auth.users on
  delete cascade, added_at timestamptz)` lists the admins. The owner's
  account is inserted once by SQL; there is no UI to add admins (adding
  one is a deliberate SQL step).
- Admin status is decided **in the database**, never by an email check in
  the browser: every admin read goes through a `SECURITY DEFINER` function
  that first checks `auth.uid()` is in `site_admins` and otherwise raises.
  `site_admins` itself is not readable by `anon`/`authenticated` except a
  tiny `is_site_admin()` → boolean for the caller (used only to show the
  link).

### The portal
- Route `#/admin`, linked from the leader home only when `is_site_admin()`
  is true. Anyone else opening `#/admin` sees "仅限管理员 · Admins only" and
  no data (the server refuses anyway).
- v1, read-only:
  1. **带领者 · Leaders** — name, email, joined, last sign-in, number of
     studies, live sign-ups, shared answers, Ask AI uses this month (from
     `ai_usage`). Newest first, the shared search box (`PackListing`
     pattern) when long. One `admin_leaders()` function returns it.
  2. **意见反馈 · Feedback** — the feedback messages (newest first) with
     their context, so the owner no longer needs the dashboard
     (`admin_feedback()`).
  3. **全站统计 · Site stats** — the existing `site_stats()` numbers, plus
     active leaders this month.
- Members' personal details (sign-up names, emails, phones, shared
  answers, Ask AI history) are **not** shown in the portal: those belong to
  each leader's own pages. The portal shows counts for them only.

### Later (not in v1)
- Actions: pause a leader's AI use, adjust a leader's monthly AI limits,
  remove a leader's account and data on request (the deletion path ADR-0020
  requires). Each needs its own confirm step and an audit row
  (`admin_actions`: who, what, when).
- Approving new leaders (invite code or allow-list) — the "who may be a
  leader" question in ADR-0020; the portal is where it would live.

## Privacy and security

- Owner-only by database rule (the `SECURITY DEFINER` check), not by
  hiding UI; covered by a rolled-back live probe: the owner can call each
  admin function; another signed-in leader and `anon` are refused.
- No admin data in URLs, logs or the browser's storage; the page reads it
  fresh each visit.
- Privacy notice: one line that the site's owner can see leaders' names,
  emails and activity counts to run the site.

## Consequences

- The owner sees who uses the site, and how much, without the Supabase
  dashboard or SQL; feedback is readable in one place.
- One more privileged surface: kept small (read-only v1), enforced in the
  database, tested live.
- Adding a second admin is a conscious SQL step.

## Implementation notes (2026-10-11)

- **The admin is also a leader.** `#/leader` is unchanged for everyone; an
  admin additionally sees a quiet "管理 · Admin" link under the sign-out
  line (`AdminLink`), shown only when `is_site_admin()` answers true. While
  checking, on false, or when the check fails (e.g. before the SQL is
  applied) the link is simply absent — never an error on every leader's
  home; `#/admin` itself shows any failure in full.
- **Enforcement.** `assert_site_admin()` (no client grant) raises SQLSTATE
  `AD403` unless `auth.uid()` is in `site_admins`; every `admin_*` function
  calls it first, is `SECURITY DEFINER` with `search_path = public`, and is
  executable by `authenticated` only (revoked from PUBLIC and `anon`).
  `is_site_admin()` takes no argument, so it cannot probe other accounts.
  The page reads `admin_*` only after a true `is_site_admin()`, and maps
  `AD403` to "仅限管理员 · Admins only" as well.
- **Functions.** `admin_leaders()`: id, email, full name
  (`raw_user_meta_data` full_name, else name), joined, last sign-in,
  studies (`study_packs`), live sign-ups (`replaced_at IS NULL`), shared
  answers (`checkin_answers`), Ask AI uses this month. `admin_feedback()`:
  id, message, email, context, created_at, newest first — never `ip_hash`.
  `admin_stats()`: `site_stats()` plus `accounts` (auth users) and
  `active_leaders`.
- **"This month".** `ai_usage` is bucketed by UTC calendar month (the
  quota's `month` key), so a Los Angeles month cannot be cut out of it:
  Ask AI uses this month = the current quota month's `'ask'` count, the
  same figure the leader's own quota shows (differs from an LA month only in
  the last evening hours of a month). **Active leaders this month** =
  distinct accounts that, since the start of the current calendar month in
  America/Los_Angeles, signed in (`last_sign_in_at`), saved a study
  (`study_packs.updated_at`) or used the site's AI (`ai_usage.updated_at`,
  count > 0). Sign-in alone undercounts: a refreshed session never signs in
  again.
- **The first admin.** The SQL file ends with a separate, idempotent
  `INSERT … SELECT id FROM auth.users WHERE email = 'csheargm@gmail.com'
  ON CONFLICT DO NOTHING` (inserts nothing until that account has signed in).
- **UI.** Tabs 带领者 Leaders (default) / 意见反馈 Feedback (count badge) /
  统计 Stats. Leaders: totals row, the shared search box (`ListSearch`,
  generalised from `PackListing`) from 8 leaders over name and email, the
  sign-up table's style (stacked cards on phones), newest joined first,
  times as local "2026-10-09 15:12" with the ISO time as tooltip, shared > 0
  as the gold badge. Feedback: cards with the source label
  (`FEEDBACK_SOURCE_LABELS`, feedback.ts) and a mailto reply link.
- **Tests.** `database/__tests__/adminPortalSchema.test.ts` pins the SQL;
  `adminPortal.live.test.ts` is the rolled-back probe (LIVE_DB=1);
  unit tests in `components/admin/__tests__`, the leader home and the
  landing router; `tests/e2e/admin.spec.ts` with RPCs faked under the SQL's
  rule.

## Release

1. SQL: apply `database/admin-portal-schema.sql` (tables, functions, owner
   insert); check `select * from site_admins` lists the owner.
2. Live probe (rolled back): `LIVE_DB=1 npx vitest run
   database/__tests__/adminPortal.live.test.ts` — owner allowed; another
   leader gets AD403; anon refused; `site_admins` unreadable.
3. Site: deploy (`#/admin`, the leader-home link, the privacy line).
