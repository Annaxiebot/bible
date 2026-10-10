# ADR-0021: Ask AI conversations are saved per study, for the leader only (2026-10-09)

Status: accepted (owner, 2026-10-09). To be built.

## Context

- The TV's Ask AI keeps its conversation in memory only
  (`components/studypack/useAskAI.ts`): closing the panel or reloading the
  page loses it.
- Owner: saving is worth it — the leader can reread what the group asked
  and what the AI answered, follow up next week, and a reload mid-meeting no
  longer loses the thread. "People know AI can make mistakes", so a saved
  wrong answer is acceptable.
- Questions asked in a group can be personal; whatever is saved must stay
  with the leader.

## Decision

### What is saved, and where
- Each completed Ask AI exchange (the question, the answer, the model that
  answered, the time) on a study **the signed-in leader owns** is saved to a
  new Supabase table `ask_ai_history` (`id`, `leader_id`, `pack_id`,
  `question`, `answer`, `model`, `created_at`).
- Row Level Security: a leader can select, insert and delete only their own
  rows (`auth.uid() = leader_id`), and may insert only for a pack whose
  `study_packs.leader_id` is themselves. `anon` has no access. Members never
  see it; it is never put in an email, a check-in, the shared-answers
  section or the site statistics.
- Nothing is saved when Ask AI runs on a study the viewer does not own (the
  demo pack, a pack not signed in, someone else's public pack): those keep
  today's in-memory behaviour.
- Failed, empty or cancelled answers are not saved.

### Limit: 20 per study, then the leader decides
- At most `ASK_HISTORY_LIMIT = 20` exchanges are kept per study.
- When a study already holds 20 and a new answer completes, a quiet notice
  appears under it: "已存满 20 条 · 20 saved — 以后替换最早的一条？ · Replace
  the oldest from now on?" with "替换最早 · Replace oldest" and "不保存 ·
  Don't save". The new exchange is shown either way; it is saved only on
  "Replace oldest".
- "Replace oldest" is the leader's permission for that study: from then on
  each new exchange replaces the oldest one (round robin) without asking
  again. The permission is stored with the study (synced, so it holds on
  every device the leader uses) and can be withdrawn from the history list.
  "Don't save" asks again the next time the limit is met.
- The limit is also enforced in the database (an insert past 20 for one
  pack fails unless it is the replace path), so no client can grow a
  study's history without bound.

### Using it
- **Reopening Ask AI on the same study restores the saved exchanges**
  (oldest first, the newest at the bottom) so the thread continues; they
  are also the conversation history sent with a follow-up question, within
  the existing message and size caps.
- A quiet "清空 · Clear" in the panel starts a fresh conversation view
  without deleting anything.
- The study's sign-ups page (`#/leader/<id>`) gets a "问一问记录 · Ask AI
  history" section: the questions, newest first, with dates; tapping one
  shows its answer; each can be deleted; one "全部删除 · Delete all" with a
  confirm; and the replace-oldest permission shown and revocable.

### Privacy notice
`public/privacy.html` gains one line: Ask AI questions and answers on a
leader's own studies are saved to that leader's account so they can review
them; only that leader can see them; they can be deleted at any time, and
are deleted with the study or the account.

## Consequences

- A leader can review and continue a study's Ask AI conversation on any
  device; a reload no longer loses it.
- One more table holding personal data (questions may be personal): covered
  by owner-only RLS, the privacy line, per-item and delete-all, and
  cascading deletes (deleting the study or the user removes its history).
- Storage stays small and bounded: ≤ 20 rows per study.
- Not saved: exchanges on studies the viewer does not own.

## Release

1. Apply the SQL (table, indexes, RLS, the 20-row limit, cascades).
2. Deploy the site (no edge function change).
3. Live check with a rolled-back probe: owner can insert/select/delete,
   another user and anon cannot, the 21st insert is refused without the
   replace path.
