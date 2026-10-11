# ADR-0023: A site admin portal, visible only to the site's owner (2026-10-11)

Status: proposed. Owner decision: the list of leaders (and similar
site-wide information) must be visible only to the site's owner, through an
admin portal. Not built yet.

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

## Release (when built)

1. SQL: `site_admins`, `is_site_admin()`, `admin_leaders()`,
   `admin_feedback()`; insert the owner's user id.
2. Site: `#/admin` + the leader-home link for admins.
3. Live probe (rolled back): owner allowed; another leader and anon refused.
4. Privacy notice line.
