# ADR-0020: Leaders may sign in with an email link or code, not only Google (2026-10-07)

Status: **accepted — built 2026-10-23** (owner: "go ahead with the follow-up
release": AI now needs sign-in, ADR-0007, so a second way in is needed for
leaders without Google). First written 2026-10-07 as proposed/deferred. See
"Built (2026-10-23)" at the end for what differs from the design below.

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

## Built (2026-10-23)

### What shipped
- **One shared block** `components/signin/SignInChoices.tsx`: "用 Google 登录"
  and, beside it, the quieter "用邮箱登录 Sign in with email". Used by the AI
  service form (New study, the TV Ask-AI overlay, #/setup) and the leader
  home. The landing nav's "带领者登录 Leader sign-in" now links to #/leader
  (both choices there) instead of starting Google directly. Strings in
  `components/signin/signInStrings.ts` (Chinese first).
- **Steps** (`useEmailSignIn`, `EmailSignIn`): address → "发送登录链接" →
  "已发送，请查看邮箱" (said for every address: no enumeration) + a code box
  (digits only, `autocomplete="one-time-code"`) → "已登录". A wrong or expired
  code, a rate limit, and the default mailer's refusal each have their own
  Chinese-first line; anything else shows the server message.
- **Calls** (`components/signin/emailAuth.ts`): `signInWithOtp({ email,
  options: { emailRedirectTo: origin + path, shouldCreateUser: true } })`
  and `verifyOtp({ email, token, type: 'email' })` on the shared client
  (`getSignupClient`). New addresses become accounts on first sign-in.
- **Back to where they were**: the start page is remembered
  (`services/authReturnHash`), now in localStorage with a one-hour expiry —
  an emailed link opens a new tab of the same browser — and consumed on
  read. Google uses the same record.
- **The email** (`supabase/auth/emailSignIn.ts`): one Chinese-first body for
  both Supabase templates (new address = "confirmation", known = "magic
  link"), in the check-in emails' paper colours, with the link button and
  the 6-digit code; subject "你的登录链接和登录码 · Your sign-in link and
  code". Codes are 6 digits (`mailer_otp_length`, was 8 on the project) and
  link + code expire after 15 minutes (`mailer_otp_exp` 900, was 3600);
  both single use (Supabase).
- **Project config** `scripts/supabase/email-signin-config.ts` (Node 24):
  dry run by default (reads the live auth config, prints only non-secret
  fields), `--apply` sends one PATCH. Read on 2026-10-23: the email provider
  is already on, site_url is https://scripturetolife.org and the redirect
  list already has `https://scripturetolife.org/**`, so the change is the
  template, subject, code length and expiry only. Additive: the live site
  has no email button, so applying it early changes nothing for it.
- **Privacy page**: what email sign-in sends and keeps (a link and a code,
  no passwords, one account per address).

### Differs from the design above: the mailer
- Owner decision: **keep Supabase's default mailer for now**; custom SMTP
  (Resend, the scripturetolife.org sender the check-ins use) is a later
  step. Supabase documents two limits of the default mailer: it sends
  **only to addresses of the project's team** ("Supabase Auth will refuse to
  deliver messages to addresses that are not part of the project's team"),
  and about **2 emails per hour** for the whole project (the project's
  `rate_limit_email_sent` reads 2). Until custom SMTP is set, email sign-in
  works for team members only; anyone else gets "邮箱登录暂时无法发到这个邮箱，
  请用 Google 登录" (`email_address_not_authorized`) and can use Google.
- **The link + code template waits for custom SMTP too** (found applying
  it, 2026-10-23). The Management API refuses any email-template or subject
  change on the free plan while the default mailer is used ("Email template
  modification is not available for free tier projects using the default
  email provider"). Applied on live: code length 6 and expiry 900 s
  (`mailer_otp_length`, `mailer_otp_exp`); not applied: the template and
  subject. Until custom SMTP is set, a team member's email is Supabase's
  link-only "Your sign-in link" template: the link signs in, but there is
  no code to type, although the page offers the code box. After SMTP is
  set, run `node scripts/supabase/email-signin-config.ts --apply` once.
- **Later step — custom SMTP:** in Supabase Auth → SMTP settings, host
  `smtp.resend.com`, port 465, user `resend`, the Resend API key as
  password, sender e.g. `Scripture to Life <signin@scripturetolife.org>`;
  then raise the email rate limit (Auth → Rate limits). No code change.

### Decided by building it
- **Who may be a leader:** (a) anyone with an email, the same rule as Google
  today; cost is bounded by the monthly quotas and the site-wide daily pack
  cap (ADR-0007 "Caps"). Approval (ADR-0024 `pending`) stays a later step.
- **Same account via Google or email:** Supabase links identities with the
  same verified email automatically; to be confirmed once on the live
  project after release (sign in both ways with one address; one row in
  Authentication → Users).
- **Account deletion:** unchanged minimum — write to the address on the
  privacy page.

### Release
1. `node scripts/supabase/email-signin-config.ts` (dry run), then `--apply`
   (any time before the site deploys; additive).
2. Deploy the site.
3. Live check with a team member's address: link and code both sign in;
   Google and email for one address are one user.
4. Later: custom SMTP (above) to open email sign-in to every leader.
