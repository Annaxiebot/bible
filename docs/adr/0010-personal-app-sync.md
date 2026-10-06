# ADR-0010: One Google login syncs the personal app; signed out it stays local (2026-10-05)

Status: accepted. Owner decision: "The personal Bible app (#app) should reuse
the Google login: if the user logs in with Google, their data is synced to the
Supabase server; otherwise the data is only saved locally in the browser, or
can be exported manually."

## Context

- The landing page, the leader pages and the personal app (#app) already share
  ONE Supabase session (`services/supabase.ts` `authManager`): AuthPanel,
  LandingLeaderLink, UnclaimedSignIn and #/setup all call
  `authManager.signInWithGoogle()`.
- `services/syncService.ts` syncs notes, annotations, reading history,
  last_read, user_settings, journal (+ journal_media), verse_data, bookmarks,
  chat_history, spiritual_memory and sync_metadata. On sign-in it ran only an
  *incremental* sync, which pulls modules whose server stamp is newer — so
  data written while signed out never uploaded until it was edited again.
- The live project had notes, annotations, reading_history, user_settings,
  last_read, customizations, journal and journal_media, but **not**
  verse_data, bookmarks, bible_cache, chat_history, spiritual_memory or
  sync_metadata. No SQL file in the repo defined them: they existed in the
  app's first Supabase project, were created by hand there, and were never
  captured when the app moved to this project. supabase-js resolves a failed
  upsert with `{ error }` instead of throwing, and four of those upserts
  ignored the result, so every push to them failed silently.
- Separately, `syncVerseData` filtered on `VerseData.updatedAt`, a field the
  type does not have, so even with the table present it uploaded nothing.

## Decision

1. **One login.** `services/syncLifecycle.ts` (started in `index.tsx` next to
   the leader-settings sync) watches the shared session. Any sign-in — from
   the landing nav, a leader page, AuthPanel or the #app sync line — starts
   the personal sync: a **full** sync the first time this browser sees that
   user (pushes what was saved while signed out, pulls the rest; flag
   `bible_sync_full_done:<uid>`, left unset when a step fails so it retries),
   an incremental sync after that, plus the 5-minute periodic sync. Token
   refreshes (same user) start nothing. **Sign-out** stops the periodic sync
   and cancels a running one; local data is never deleted.
2. **The five recovered tables.** `database/personal-sync-schema.sql` creates
   verse_data, bookmarks, chat_history, spiritual_memory and sync_metadata,
   every column and key derived from what syncService writes. The table
   names, conflict targets and row builders live in ONE place,
   `services/syncRows.ts`; syncService reads and writes only through it, and
   `database/__tests__/personalSyncSchema.test.ts` pins SQL ↔ code. Each
   table: `user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE`,
   `updated_at`, RLS with four owner-only policies (`auth.uid() = user_id`)
   for `authenticated`, `REVOKE ALL … FROM anon`. sync_metadata joins the
   `supabase_realtime` publication (the cross-device trigger). Applied live
   2026-10-05; a rolled-back live probe per table
   (`personalSync.live.test.ts`, LIVE_DB=1) round-trips syncService's exact
   rows and checks RLS as the owner, another user and anon.
3. **bible_cache is not recovered — it stops syncing.** It held a per-user
   copy of *public* Bible text. BSB and CUV are bundled
   (`public/bible-data`), other versions re-fetch from their public source,
   and storing the same chapters once per user cost Disk IO and egress for
   nothing personal. `syncBibleCache` and its step are deleted.
4. **Failures are loud.** The recovered tables' upserts throw on `{ error }`
   (`throwIfUpsertFailed`); verse data uses `verseDataStamp` (note
   `updatedAt` / newest research `timestamp`).
5. **Local-only is the visible default.** The sidebar header shows ONE line:
   signed out "未登录：数据只保存在本浏览器 · 登录后自动同步 · Not signed in:
   data stays in this browser · sign in to sync" with Google sign-in and
   "导出 Export"; signed in "已登录 · 已同步 · Signed in · synced", the last
   sync time and sign-out. The old collapsible "Cloud Sync" section is gone
   from #app (AuthPanel remains on the leader page).
6. **Export / import — one file.** "导出全部数据 · Export all my data" (sidebar
   and the line's Export, both through `exportAndDownloadAll`) downloads
   `bible-app-my-data-YYYY-MM-DD.json`:
   `{ kind: "bible-app-personal-data", version: "5.0", exportDate, notes,
   verseData, annotations, bookmarks, journal, chatHistory, spiritualMemory,
   readingPlans, readingHistory, settings }`. Journal media travel as the
   references (storage URLs / ids) the entries carry; image blobs and public
   Bible text are not included; settings are the synced preference keys
   minus every `*_api_key`. "导入 · Import" merges and never deletes: a
   missing record is added, a record on both sides keeps the newer one by its
   own timestamp (`lastModified` / `updatedAt`; verse data keeps the newer
   note and unions research), records without one (bookmarks, plans,
   settings) are only added when absent. v1–v3 backups still import.

## Consequences

- A user who never signs in keeps everything in this browser and can move it
  with the one export file. Signing in anywhere is enough to sync.
- API keys never sync (fixed 2026-10-05, right after this sync went live and
  before any row held one — `user_settings` had 0 rows): `SYNCED_SETTINGS_KEYS`
  no longer lists any `*_api_key`, and `isSyncableSettingKey` refuses one
  arriving from an old server row. The export never carries them either.
- Importing writes locally; records whose timestamps predate the last sync
  reach the server on their next edit, not immediately.
