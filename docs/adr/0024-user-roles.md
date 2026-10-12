# ADR-0024: User roles — owner, admin, leader (2026-10-11)

Status: accepted (owner, 2026-10-11) — design only; build deferred until the
owner names a second admin or wants new leaders to need approval.

## Context

- ADR-0023 made the site's owner the only admin through a `site_admins`
  list that only SQL can change. There is no role for anyone else, and no
  way in the site to give someone admin rights.
- The owner asked for a role per user (admin, leader), with admin having
  every leader function, and only admins changing roles — then added: the
  owner's own role must never be changeable by anyone else.
- Admin data includes leaders' emails (personal data), so admin rights
  should go to as few people as possible.

## Decision

### Three roles, highest first
| Role | Who | Can |
|---|---|---|
| owner 所有者 | exactly one: the site's owner (csheargm@gmail.com) | everything an admin can, plus make or remove admins and read the role-change log |
| admin 管理员 | named by the owner | everything a leader can, plus the admin portal (ADR-0023), read-only |
| leader 带领者 | everyone who signs in (default) | create and run their own studies (unchanged) |

Each higher role includes everything below it; the database checks "leader
or above", "admin or above", never one exact role.

### Where roles live
- A table `user_roles (user_id uuid primary key references auth.users on
  delete cascade, role text check (role in ('owner','admin','leader')),
  updated_at)`. Not a column on `auth.users`: that table belongs to
  Supabase Auth and may change under upgrades.
- An account with no row is a leader. A unique partial index allows at most
  one `owner` row.
- `site_admins` is migrated into it (the owner row) and dropped;
  `is_site_admin()` / `assert_site_admin()` keep their names and meaning
  ("admin or above"), so the ADR-0023 functions need no change.

### Who may change a role (enforced in the database)
The only writer is one `SECURITY DEFINER` function, `set_user_role(user_id,
role)`; `authenticated` has no INSERT/UPDATE/DELETE on `user_roles`.

The owner MAY:
- make a leader an admin;
- make an admin a leader.

The owner MAY NOT, through the site:
- change their own role;
- give the owner role to anyone.

An admin MAY NOT:
- change any role (their own, another admin's, the owner's, or a leader's).

A leader or a signed-out visitor MAY NOT call it at all.

Changing or transferring the owner is a deliberate SQL step, outside the
site. Because the owner always exists and cannot be demoted through the
site, the site can never be left without an admin.

### Audit
Every role change writes a row to `role_changes` (who changed it, whose
role, old role, new role, when). Only the owner can read it; nobody can
edit or delete it through the site.

### UI
- Leaders tab (ADR-0023): for the owner only, a role menu on each row
  (带领者 Leader / 管理员 Admin) with a confirm step; the owner's own row
  shows "所有者 · Owner" with no menu. Admins see the role as text only.
- A small "角色记录 · Role log" view for the owner.

### What an admin sees
The portal as built in ADR-0023: leaders' names, emails and activity
counts; feedback with senders' emails; site stats. Not members' personal
details, shared answers, Ask AI history, or other leaders' studies (counts
only). Not the role log.

## Later (not in this ADR's build)
- `pending` 待批准: new sign-ins wait for approval before creating
  studies — the "who may be a leader" question in ADR-0020. If added, the
  owner decides whether admins may approve.
- `blocked` 停用: stop an account misusing the AI.
Each needs its own decision and update to the rules above.

## Consequences
- The owner can name a second admin with a button instead of SQL, and no
  one but the owner (or direct SQL access) can change who is an admin.
- One more privileged write path: one function, owner-only, audited, and
  covered by a rolled-back live probe (owner may promote/demote; owner may
  not change self or grant owner; admin, leader and anon refused).
- Until the build: ADR-0023 stays as is; the owner is the only admin.
