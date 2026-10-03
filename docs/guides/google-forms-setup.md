# Google Forms (optional) · 连接 Google 表单（可选）的设置

**Google Forms is an opt-in, not the default.** Every pack's feedback goes
through the built-in check-in page (`#/checkin/<signupId>`, Supabase) unless
the leader explicitly connects Google Forms for that pack or pastes a form
link. Nothing in this guide is needed for ordinary sign-in or for the
built-in page.

Why the built-in page is the default (owner decision, 2026-10-02):

- Ordinary Google sign-in asks for identity only (`openid email profile`).
  No sensitive scope means no Google app verification, no "unverified app"
  warning, and no Testing-mode test-user list for leaders who never use
  Forms.
- Supabase is the single backend: commitments, check-in answers and the
  leader page already live there; a form adds a second place to look.
- A form is still useful for a leader who wants answers in their own Google
  account (a spreadsheet, sharing with a co-leader). That is what the
  opt-in is for.

## Owner steps (Google Cloud console) — only if any leader will opt in

1. Open the Google Cloud project that holds the OAuth client Supabase uses
   for Google sign-in (Supabase dashboard → Authentication → Providers →
   Google shows the client id; find that client under *APIs & Services →
   Credentials*).
2. *APIs & Services → Library* → enable **Google Forms API**.
3. *APIs & Services → OAuth consent screen*:
   - add the scope `https://www.googleapis.com/auth/forms.body`
     (it is a *sensitive* scope);
   - keep the app in **Testing** mode and add each opting-in leader's
     Google address under *Test users* (up to 100). Google verification of
     the sensitive scope is a later step — not needed while in Testing mode.
4. Supabase → Authentication → Providers → Google: **no change**. The app
   requests the extra scope only on the opt-in sign-in
   (`services/googleForms.ts googleSignInOptions(true)`, used by
   `services/supabase.ts authManager.signInWithGoogle({ withForms: true })`)
   with `access_type=offline` and `prompt=consent`, so that session carries
   `provider_token` (and `provider_refresh_token`).

## What happens in the app

- Ordinary sign-in (AuthPanel, leader page, "登录以启用报名 Sign in to
  enable sign-up") is identity-only. A source-scan test pins that the only
  caller passing `withForms` is the editor's opt-in
  (`services/__tests__/googleSignIn.test.ts`).
- In the editor, under "Google 表单链接（可选）", the button **"连接 Google
  表单（可选）Connect Google Forms (optional)"** shows while the pack has
  no form link. Tapping it:
  - with a session that already carries `provider_token`: calls
    `forms.create` + `forms.batchUpdate` (`services/googleForms.ts`) for
    this pack and stores the responder link (`feedbackFormUrl`, synced to
    `pack_summaries`), so every check-in link points at the form;
  - otherwise: remembers the pack id (sessionStorage), re-runs the Google
    sign-in with the Forms scope + consent, returns to the same editor
    (`services/authReturnHash`), and creates the form then.
- Typed failures (permission not granted, Forms API not enabled, API
  error, network) are a bilingual notice; the pack keeps the built-in page;
  tapping Connect again retries. Nothing throws.
- The token stays in the browser session only: never logged, never sent to
  our backend. The Forms API is called directly from the browser.
- Pasting an existing form link (generation form or editor) needs no Google
  permission at all. "用于我所有的查经 · Use for all my studies" remembers
  that link as the leader's default (`STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL`).

## Prefilled links

Google Forms prefill format: `<form>/viewform?usp=pp_url&entry.<id>=<value>`.
The Forms API returns hexadecimal `questionId`s; the decimal `entry.<id>`
used by prefilled links is not documented as derivable from them, so
created forms are linked plain. A leader who wants name + practice
prefilled: open the form → ⋮ → *Get pre-filled link* → copy the two
`entry.<id>` values into the editor's "姓名 entry id" and "操练 entry id"
fields.

## Later (not now)

Reading responses back (`forms.responses.readonly`) to show form answers on
the leader page would be a second sensitive scope and a Google verification
conversation. The built-in page already shows shared answers there.
