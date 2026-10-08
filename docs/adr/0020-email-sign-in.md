# ADR-0020: Leaders may sign in with an email link or code, not only Google (2026-10-07)

Status: **proposed — deferred.** Owner decision: write it down now, build it
when forgotten-Google-password sign-in problems actually show up in use.
Trigger to build: more than an occasional leader who cannot get in with
Google (owner's judgement; feedback emails and direct reports count).

## Context

- Leader sign-in is Google only (`authManager.signInWithGoogle`, Supabase
  Auth OAuth; ADR-0006/ADR-0010). One Supabase session serves the landing,
  the leader pages, New study and the personal app.
- Some leaders do not remember their Google password. The owner asked
  whether the site should offer its own accounts: sign-up with name and
  email (mandatory), church and group name, an email to confirm the
  address — and noted that running user accounts brings privacy and data
  liability, so it should be thought through first.

## Options considered

1. **Email sign-in link + code (passwordless, Supabase Auth `signInWithOtp`)**
   — chosen when built.
2. **Our own accounts with passwords (Supabase email + password)** — rejected
   for now: the leader then forgets *our* password instead of Google's, and
   we take on password reset flows; it invites richer sign-up data we do not
   use yet.
3. **Do nothing** — the status quo until the trigger above.

## Decision (to build when triggered)

### Flow
- The sign-in screen keeps "用 Google 登录 · Sign in with Google" and adds a
  second, quieter choice "用邮箱登录 · Sign in with email".
- The leader types an email → "发送登录链接 · Send sign-in link" → the page
  says "已发送，请查看邮箱 · Sent — check your email" and shows a box for a
  6-digit code.
- The email (Chinese first, the check-in emails' paper style) carries **both**
  a one-click link and a **6-digit code** ("登录码 · Sign-in code"). The code
  is for the common case of reading email on a phone while signing in on a
  laptop or the church TV: clicking the link signs in the device it is
  clicked on.
- Link and code are **single use** and **expire in 15 minutes** (Supabase
  OTP expiry; default is 1 hour).
- After sign-in the session persists on that device exactly as Google's
  does (refreshed in the background) until "退出登录 Sign out" or the
  browser's data is cleared. A new device needs one new link/code.
- The same email address signing in with Google and with a link is the same
  Supabase user (identity linking by verified email), so a leader's packs,
  settings and quotas follow them whichever way they sign in — to be
  verified on the live project before release.

### What is stored
Nothing new: the email address (which Google sign-in already stores) and
Supabase's own auth records. No passwords. **No profile fields at sign-in**
— church name, group name and display name are not collected until a
feature uses them (e.g. a TV title line or email signature); if added later
they are optional, editable, and listed in the privacy notice.

### Email delivery
Supabase's built-in mailer allows only a few auth emails per hour, so auth
emails go through the site's own sender (custom SMTP: Resend, the
scripturetolife.org domain already verified for check-in emails), from the
same address family as the check-ins, with the auth email template written
in the site's style.

## Privacy and liability (must be done in the same release)

- **Privacy notice** (`public/privacy.html`): today it says leaders sign in
  with Google only and that sign-in requests basic identity. Add email
  sign-in: the address is used only to send the sign-in link/code and to
  identify the leader; no password is stored.
- **Account deletion:** a documented way for a leader to have their account
  and data (packs, sign-ups under their packs, settings, AI usage rows)
  deleted on request — at minimum the existing "write to the address on the
  privacy page", ideally a "删除我的账号 · Delete my account" action on the
  leader page.
- **Abuse:** an open email sign-in makes it easy to create many "leaders",
  each with a monthly AI allowance. Monthly quotas already bound the cost;
  Supabase's per-email and per-IP OTP rate limits apply; the owner should
  decide **who may be a leader** before release:
  - (a) anyone with an email (as Google sign-in is today), or
  - (b) only approved leaders — e.g. an invite code the owner hands out, or
    an allow-list the owner approves on first sign-in.
  This question applies to Google sign-in too and becomes more pressing as
  the site grows; it is recorded here so it is answered once for both.
- **Enumeration:** the sign-in page must say "已发送 · Sent" whether or not
  the address already has an account, so it cannot be used to discover who
  uses the site.

## Consequences

- Leaders who cannot use Google get in with nothing to remember; the site
  stores no passwords and no new personal data.
- Auth emails now depend on the Resend domain's health (as check-ins already
  do) — a blocked sender would stop email sign-in; Google sign-in remains.
- Small build: a sign-in choice and code box, the Supabase email template
  and SMTP settings, the privacy text, tests (unit + e2e with a mocked auth
  endpoint; one live check on the real project before release).
