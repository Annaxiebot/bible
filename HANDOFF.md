# Session Handoff Brief

> **Purpose.** This file brings a fresh Claude session (or a returning human) up to speed in under 2 minutes. It captures *decisions and reasoning* that aren't in the code or in PLAN.md. It is regenerated whenever the next session needs to know something the current session learned. Think of it as the runway between sessions.

_Last updated: 2026-04-21 by end-of-day session. Commit: `87d4898`._

---

## First 90 seconds — orient

1. Read `~/.claude/CLAUDE.md` — global rules R1–R13 loaded automatically.
2. Read `./PLAN.md` — hard rules + current TODO backlog + session log.
3. Read this file — current state + decisions + gotchas.
4. Pick up from the "Next session should" section below.

---

## What is this project?

Personal AI-powered Bible study + journal app (`Annaxiebot/bible` on GitHub). React + TypeScript + Vite front end. Currently backed by Supabase (DB + auth + edge function for AI racing), but migrating to **Google Drive as storage + browser-side AI** (Phase 3 in PLAN.md). Single user, AI keys provided by user, multi-device sync via Drive.

---

## Recent big picture (last 48h)

- **Bilingual [SPLIT] bug fixed** (`6b26e7d`). English chat pane had been stuck on "Synthesizing English commentary…" for users routing through OpenRouter. Root cause: the system prompt enforcing `[SPLIT]` was copy-pasted across 5 provider files and forgotten in OpenRouter + edge function. Fixed by adding the missing prompts; structural fix followed.
- **All AI system prompts consolidated** (`2db1b14`) into `services/systemPrompts.ts`. Seven files now import one constant. `services/aiLanguageDirective.ts` (an interim partial consolidation) was deleted.
- **Hard rules written down** (`440a069`, `87d4898`). R1–R13 live in `~/.claude/CLAUDE.md` globally. R12 merged into R6 (the rules file was itself violating R3 — caught by dog-fooding R13).
- **R13 automation live** (`87d4898`). `.husky/pre-push` pipes the outgoing diff to `claude -p` against `~/.claude/review-prompt.md`. Docs-only pushes skip. Blocks push on violations. Bypass with `--no-verify` only for emergencies or when fixing the hook itself.
- **Pre-commit test runner retired** (`87d4898`). Previously ran 845 tests on every commit (~30s). Those tests are mostly mocked and did not catch any real product regression (SPLIT, sync, pencil, egress). Tests now run manually or in CI.

## What's working well right now

- R13 hook catches process violations before push — demonstrated live on its own bootstrap commit.
- `git commit` is instant (no more 30s ceremony).
- `git push` on a docs-only change takes ~1s.
- `git push` on code changes takes ~15–30s and produces a real review.

## What's not working / known debt

- **Apple Pencil** on iPad Safari: multiple recent commits show the pattern "fix A → regression in B → revert → re-fix." There is no integration test matrix. This is the single biggest active pain point.
- **845 tests provide false confidence.** Passed through all known shipped bugs. Needs audit (delete/demote mocks; promote integration tests).
- **`NotabilityEditor.tsx` is 2,700+ lines** — violates R4. Scheduled for split before any more features land in that file.
- **Supabase free-tier egress at 97%** with grace period through 2026-05-05. Mitigations queued in PLAN.md Phase 2 but not started.
- **Edge function has inline `[SPLIT]` prompt** — last remaining R3 loophole in the AI stack. Deno import path for `systemPrompts.ts` is the blocker.

---

## Next session should (priority order)

### If you have ~30 minutes
**P0: Edge function R3 cleanup.** Make `supabase/functions/ai-chat/index.ts` import `BIBLE_SCHOLAR_SYSTEM_PROMPT` from the shared module. Deno supports relative TS imports if the module is pure (no Node-specific imports). `services/systemPrompts.ts` already is. Try `import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from "../../../services/systemPrompts.ts";` (path depth may vary). Test with `supabase functions serve ai-chat`. Ship.

### If you have ~3 hours
**P0: Audit the 845 tests.** Run `npx vitest run --reporter=verbose | tee /tmp/tests.txt`. For each test file: does it mock the external boundary, or exercise real behavior? Mocked-only tests move to `npm run test:slow` (CI only) or get deleted if they've never caught a real bug. Target: ≤150 tests that each pull their weight. This is the single highest-ROI quality investment.

### If you have a full day
**P0: Playwright pointer-event matrix for Apple Pencil.** `~20` tests covering `{pen, touch, mouse} × {pointer, text, lasso, scroll} × {drag, click, hold}`. Use Playwright's pointer synthesis. Every future pencil bugfix ships paired with the failing test it fixes (R6). Kills the whack-a-mole pattern.

### Big strategic move (week-plus)
**Phase 3: Google Drive migration.** Detailed plan in PLAN.md. Start with `services/googleDriveSyncService.ts` behind a feature flag, parallel to Supabase. Four-week rollout. Drive + IndexedDB + browser-side AI racing replaces the entire Supabase stack.

---

## Gotchas / tribal knowledge

- **Parallel Claude sessions collide.** Earlier this week two sessions added similar "copy button" UI to `ChatInterface.tsx` and produced a merge conflict. R2 exists because of this. When doing any non-trivial change, `git fetch origin` first and check for unexpected recent commits. If 10+ commits came in since your last fetch, someone (or another session) has been active — rebase before starting, not after.
- **The `.husky/pre-commit` hook has a deprecation warning** (`.husky/_/husky.sh` sourcing). It fires every commit. Harmless but noisy. Low-priority cleanup tracked in PLAN.md Phase 0.
- **R13 will block your push if the reviewer disagrees.** That's the feature. If you think it's wrong, either (a) fix the violation, (b) improve `~/.claude/review-prompt.md` to reduce false positives, or (c) `--no-verify` for the specific case. Never (d) "just ignore it and trust me."
- **Supabase CLI version file** (`supabase/.temp/cli-latest`) appears in `git status` after any CLI use. Don't commit it. Add to `.gitignore` if it keeps being annoying.
- **Claude Code login is per-machine.** When you start on Mac mini, expect to run `claude login` once.

---

## Open questions you (user) might want to decide

1. **Keep Supabase or commit to Drive migration?** Phase 3 plan is ready. 4 weeks solo work. Driving force is the "reliability + user owns data + no server ops" argument. Counter is "Drive is object storage, not a database — fewer features."
2. **Self-hosted Supabase on WSL as a middle ground?** Discussed; not chosen because it adds ops burden.
3. **Accept that 845 tests → ≤150 is a real deletion, not a reorganization?** Some tests will be deleted outright, not merely moved. This requires committing to "we had too many wrong tests."

---

## Opening prompt for the next Claude session

Paste this as your first message:

```
Read HANDOFF.md in the current repo, then ~/.claude/CLAUDE.md, then ./PLAN.md.
Then summarize in 5 lines: what state the project is in, what the top 3 open
tasks are, and what you'll do first unless I tell you otherwise.
Don't start coding until I confirm your plan.
```

This forces the fresh session to load all three rule/context documents before taking any action, and to surface its interpretation before drifting.

---

## Who edits this file

Whoever ends a session that generated non-obvious decisions updates this file. "Non-obvious" means: a decision where the reasoning isn't captured by the code or the commit message alone. Example of what belongs here: "We chose Drive over CouchDB because of user-owned-data, not because Drive is technically better." Example of what does NOT belong here: specific bugfixes (those go in commits), general rules (those go in `~/.claude/CLAUDE.md`), or the TODO list (that's PLAN.md).
