# Google Forms setup · 自动建反馈表的设置

The app creates one Google Form per study pack in the **leader's own Google
account** (the same identity as the Google sign-in). This needs a one-time
setup by the project owner; leaders only sign in again once.

## Owner steps (Google Cloud console)

1. Open the Google Cloud project that holds the OAuth client Supabase uses
   for Google sign-in (Supabase dashboard → Authentication → Providers →
   Google shows the client id; find that client under *APIs & Services →
   Credentials*).
2. *APIs & Services → Library* → enable **Google Forms API**.
3. *APIs & Services → OAuth consent screen*:
   - add the scope `https://www.googleapis.com/auth/forms.body`
     (it is a *sensitive* scope);
   - keep the app in **Testing** mode and add every leader's Google address
     under *Test users* (up to 100). Google verification of the sensitive
     scope is a later step — not needed while in Testing mode.
4. Supabase → Authentication → Providers → Google: **no change**. The app
   requests the extra scope at sign-in time
   (`services/googleForms.ts GOOGLE_SIGN_IN_SCOPES`, used by
   `services/supabase.ts authManager.signInWithGoogle`) with
   `access_type=offline` and `prompt=consent`, so the session carries
   `provider_token` (and `provider_refresh_token`).

## What happens in the app

- A leader who signed in before this change has no `provider_token`: the
  editor shows "未获得 Google 表单权限 — 请重新登录 · Google Forms permission
  not granted — sign in again" and falls back to the built-in check-in page.
  Signing out and in again fixes it.
- With a token, generation (or Save on a pack without a form) calls
  `forms.create` + `forms.batchUpdate` (`services/googleForms.ts`) and stores
  the responder link on the pack (`feedbackFormUrl`) and in `pack_summaries`.
- The token stays in the browser session only: never logged, never sent to
  our backend. The Forms API is called directly from the browser.
- Pasting an existing form link (generation form or editor) overrides
  auto-creation. "用于我所有的查经 · Use for all my studies" remembers that
  link as the leader's default (`STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL`).

## Prefilled links

Google Forms prefill format: `<form>/viewform?usp=pp_url&entry.<id>=<value>`.
The Forms API returns hexadecimal `questionId`s; the decimal `entry.<id>`
used by prefilled links is not documented as derivable from them, so
auto-created forms are linked plain. A leader who wants name + practice
prefilled: open the form → ⋮ → *Get pre-filled link* → copy the two
`entry.<id>` values into the editor's "姓名 entry id" and "操练 entry id"
fields.

## Later (not now)

Automatic form creation already needs the sensitive `forms.body` scope. A
future step could also read responses (`forms.responses.readonly`) to show
form answers on the leader page; that is a second scope and a Google
verification conversation.
