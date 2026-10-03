# ADR-0005: Leader settings follow the leader across devices (2026-10-02)

Status: accepted. Owner decision: "the settings should be saved in Supabase
once leader login."

## Context

A leader sets a handful of preferences on #/setup and the New-study form
(which model answers Ask AI, which generates packs, the fallback list, the
content language, the default feedback form). They lived only in the
browser's localStorage, so a leader who prepares on a laptop and presents
on the living-room TV box set everything twice. ADR-0004 already gives
leaders an identity (Google sign-in, `auth.uid()`-scoped rows).

## Decision

1. **Synced keys — one list.** `services/leaderSettingsKeys.ts` exports
   `LEADER_SYNCED_KEYS`: `ai_model`, `ai_pack_model`, `ai_fallback_models`,
   `content_language_default`, `feedback_form_default_url` (the
   localStorage key names, so the row reads like the browser). Nothing
   else is ever written to the row.
2. **The API key never syncs.** The OpenRouter key (and the provider
   choice) stay in the browser. A leader pastes the key once per device;
   the row carries preferences only, so a leaked row cannot spend money.
3. **Local-first, server wins on sign-in.** Reads and writes still go to
   localStorage. On sign-in `services/leaderSettings.ts` pulls the row and
   writes every synced key it holds over the local value; then, if the
   browser holds synced keys the row lacks (first sign-in on a configured
   device), one push merges them up. Every later change (the writers call
   `noteLeaderSettingChanged`) pushes the whole local set after a 1 s
   debounce; the row's map is replaced, so a cleared key disappears from
   the server too. Signed out or Supabase unconfigured → no-ops, no errors.
4. **`leader_settings` RLS.** `database/leader-settings-schema.sql`: one row
   per leader (`leader_id` = `auth.uid()`, `settings` JSONB, `updated_at`
   kept honest by a trigger). SELECT/INSERT/UPDATE only for `authenticated`
   where `auth.uid() = leader_id`; no anon access, no DELETE policy (the row
   goes with the account). Applied to the live project on 2026-10-02.
5. **One line on #/setup.** Under "模型 Models" (saved-key state): signed
   out, "登录以在各设备同步设置 Sign in to sync settings across devices" +
   the identity-only Google button (`useGoogleSignIn`, shared with the
   unclaimed-pack block); signed in, "已登录 Signed in · 设置已同步 settings
   synced" + email + sign-out. A failed pull/push shows as a red line with
   the server message, never swallowed.

## Consequences

- Writers (`services/aiDefaults` setters, `rememberContentLanguage`,
  `rememberDefaultFormUrl`) ring the change bus; the pure keys module keeps
  `services/supabase` out of modules the Playwright specs import.
- The older `user_settings` mirror in `services/syncService` still lists
  `ai_model` (and API keys) with a newer-timestamp rule; a user who also runs
  the full sync can see the two disagree on `ai_model`. Retire `ai_model`
  from that list in its own session (TODO in `services/leaderSettings.ts`).
- Server-wins-on-sign-in means an edit made signed-out on device B is
  overwritten by device A's row at B's next sign-in; the following edit on
  B pushes and wins. Acceptable: the leader signs in before presenting.
