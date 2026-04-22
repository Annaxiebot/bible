# Session Handoff Brief

> **Purpose.** This file brings a fresh Claude session (or a returning human) up to speed in under 2 minutes. It captures *decisions and reasoning* that aren't in the code or in PLAN.md. It is regenerated whenever the next session needs to know something the current session learned. Think of it as the runway between sessions.

_Last updated: 2026-04-22 by Mac mini overnight session. Current master tip: `099b543` (PR #11 merged)._

---

## First 90 seconds — orient

1. Read `~/.claude/CLAUDE.md` — global rules **R1–R17** loaded automatically (R14–R17 are new; see the overnight summary below).
2. Read `./PLAN.md` — project rules + TODO backlog + session log.
3. Read this file — current state + open PRs + architecture-review findings.
4. Pick up from the "Open PRs waiting for review" section.

---

## What is this project?

Personal AI-powered Bible study + journal app (`Annaxiebot/bible`). React 19 + TypeScript + Vite. Supabase DB + auth + edge function for AI. Migration to Google Drive + browser-side AI racing planned (PLAN Phase 3). Deployed to `https://annaxiebot.github.io/bible/` via GitHub Pages on every master push.

---

## Open PRs waiting for review (2026-04-22 overnight work)

| # | Branch | Scope | Status |
|---|---|---|---|
| [#12](https://github.com/Annaxiebot/bible/pull/12) | `architecture-review` | Whole-app architecture review → `docs/adr/0001-architecture-review.md`. Read-only, docs-only. | OPEN |
| [#13](https://github.com/Annaxiebot/bible/pull/13) | `notability-visual-polish` | Single-page visual affordance (gray bg + shadow) + viewport-aware page card height (Option A). 2 commits, 25 Playwright tests green. R13 CLEAN. | OPEN |
| [#14](https://github.com/Annaxiebot/bible/pull/14) | `rules-R14-R17` | Four new project rules: perf budgets, measure-first, AI-must-prove, dead-code tripwire. Docs-only; R13 auto-skipped. | OPEN |

Merge suggestion order: **#14** (rules, trivial) → **#12** (architecture doc, zero risk, informs next work) → **#13** (visual + viewport, real change, test on iPad first).

## Already merged this session

- **[PR #4](https://github.com/Annaxiebot/bible/pull/4)** — edge function R3 cleanup. **Still needs `supabase functions deploy ai-chat`** (manual, requires your access token).
- **[PR #6](https://github.com/Annaxiebot/bible/pull/6)** — test audit doc (`TEST-AUDIT.md`).
- **[PR #8](https://github.com/Annaxiebot/bible/pull/8), [#9](https://github.com/Annaxiebot/bible/pull/9), [#10](https://github.com/Annaxiebot/bible/pull/10)** — iPad pencil bug fixes (palm rejection, finger swipe nav, horizontal-only single-page swipe, lasso-drag, text-tap).
- **[PR #11](https://github.com/Annaxiebot/bible/pull/11)** — egress mitigation + cross-device sync bug fix. **~96% egress reduction** on journal sync cycle.

## Closed without merging

- PR #5 (pencil matrix, superseded — shipped via cherry-pick through #8/#9/#10).
- PR #7 (stale Mac mini bootstrap HANDOFF update — this file is the fresh regen).

---

## Recent big picture

- **Egress crisis averted (mostly).** Supabase free-tier was at 97 % with grace ending 2026-05-05. PR #11 dropped the journal-sync bytes from ~500 KB to ~20 KB per 5-min cycle and reading-history / bookmarks to zero at steady state. Single biggest root cause: `syncJournal` was pulling `notability_data` + `blocks` + `canvas_data` on every list poll. Now it pulls metadata only and lazy-fetches the body when the entry is opened.
- **Cross-device sync bug root-caused.** The "handwritten notes not fully displayed on another device" symptom was a real code bug, not egress throttling: `pull-merge` called `journalStorage.updateEntry()` which bumped `updatedAt` to `Date.now()`, causing redundant re-uploads and risk of stomping a third device's newer write. Fixed in PR #11 by writing via `idbService.put` directly and preserving the remote `updated_at`.
- **iPad Notability navigation is now on-parity with Notability itself.** PR #8–#10 landed: palm rejection via radiusX>25 + stylus-cancels-finger, finger swipe nav restored, horizontal-only single-page flip, lasso-drag restored, finger tap creates text boxes. Deployed to prod.
- **Whole-app architecture review complete.** PR #12's ADR-0001 surfaces specific follow-ups; summary below.
- **Rules R1–R17.** R14–R17 added this session (perf budgets, measure-first, AI-must-prove, dead-code tripwire). Live globally via dotfiles symlink.

---

## Architecture review findings (from PR #12 / ADR-0001) — prioritized

Agent C's read-only whole-app audit. The top items the user should act on:

### High-value bugs hiding in plain sight

- **`components/ErrorBoundary.tsx:23–26` does literally nothing on catch.** Silent failure swallowing entire render subtrees. R5 violation. Fix: at minimum, log + surface a user-visible fallback UI.
- **`services/syncService.ts:1133` swallows per-step sync failures.** No user surface. Possibly contributing to the "sync seems to work but doesn't" pattern. R5 violation.
- **`lastNotesSync` single-timestamp pattern at `services/syncService.ts:197–264`** allows silent local-data-loss when a local edit predates the last sync pull. Per-item sync-at tracking is the fix.

### Structural smells ranked by impact

- **27 files exceed R4 (300-LOC) budget.** Four god components hold ~9,300 LOC: `NotabilityEditor.tsx` (3,632), `JournalView.tsx` (2,405), `ChatInterface.tsx` (1,691), `EnhancedNotebook.tsx` (1,610). The PLAN's 5-way split of NotabilityEditor is correct in shape but should extract the state reducer first — splitting on current seams hard-codes the wrong boundaries.
- **AI provider layer is an R3 smell in structural form.** `services/aiProvider.ts` and `supabase/functions/ai-chat/index.ts` carry 10 parallel maps keyed on provider name (endpoints, key names, default models, all models, vision models, display names, protocol class). Adding a 16th provider = 10 coordinated edits. A `Provider` record + `PROVIDERS[]` array is an M-scope fix that also enables Phase 3 browser-side racing.
- **R5 is essentially unenforced.** 80 of 215 `try/catch` sites are silent; 31 explicit `// silently handle` comments. R17's tooling (ESLint, ts-prune) partly addresses this but a one-time audit is still owed.

### Orphans remaining (R7 violation)

- 2 `.bak` / `.backup` files still on disk despite PLAN Phase 0 claiming cleanup was done. Agent C caught this.

### What the review says is strong

- The meta-process (R1–R17, R13 pre-push hook, TEST-AUDIT.md, ADR slots) is unusually disciplined for a solo project and demonstrably working. The `systemPrompts.ts` + `singleSource.test.ts` tripwire is best-in-class.
- The pointer-matrix safety net now has 20+ green Playwright tests. Every future pencil fix ships paired with its failing test.

Full report: `docs/adr/0001-architecture-review.md` in PR #12.

---

## What to do next session

### If you have ~15 minutes
**Merge PRs #14, #12, #13** in that order. Deploy the edge function:
```
SUPABASE_ACCESS_TOKEN=sbp_... npx supabase functions deploy ai-chat --no-verify-jwt
```

### If you have ~1 hour
**Close the three high-value bugs from the architecture review:**
1. `ErrorBoundary.tsx` — surface errors (not silent render-subtree drop).
2. `syncService.ts:1133` — surface or escalate, don't swallow.
3. `syncService.ts:197–264` — per-item `sync_at` tracking to close the silent-data-loss window.
All three fit comfortably in one R2-compliant session touching `services/syncService.ts` + `components/ErrorBoundary.tsx`.

### If you have ~3 hours
**Run the test-audit regression replay.** Walk back to pre-fix commits of known incidents (SPLIT `6b26e7d`, sync `97d48a6`, pencil `ab9775f`), run `npm test`, record which tests actually fail. Tests that passed through every incident = delete candidates. PR #6 / `TEST-AUDIT.md` has the list to start from.

### If you have a full day
**AI provider layer refactor.** Convert the 10 parallel maps in `services/aiProvider.ts` + edge function into a `Provider` record + `PROVIDERS[]` array. Feeds Phase 3 browser-side racing.

### Strategic (week-plus)
**Phase 3: Drive migration.** PLAN Part II, Phase 3. The egress crisis is dampened but not gone; Drive migration is the long-term answer.

---

## Gotchas / tribal knowledge (new this session)

- **Parallel agents share the repo's `.git`, not just my worktree.** When multiple `Agent` calls use `isolation: "worktree"` against the same repo, they get separate working directories but **the same `.git`**. A commit made on a branch in agent A's worktree is visible to agent B via the shared refs. This session hit three stashes from worktree races — preserved but un-popped. Check `git stash list` and decide per-stash whether to restore.
- **Realtime subscription audit.** Only `sync-realtime` on `sync_metadata` is now active (cross-device trigger, trivial size). `journal-realtime` is disabled with a documented comment. See PR #11 for why.
- **R13 pre-push hook is more effective than expected.** This session had it catch 15+ real issues across 10 iterations — false positives were ~20 %, true positives were the rest. The `~/dotfiles/claude/review-prompt.md` has been refined twice to add commit classifications (feature-add, bug-fix, pure-refactor, test-add, docs-only) with R4/R6 carve-outs per class.
- **Cross-device sync still needs verification on real devices.** PR #11 shipped the fix but you'll want to test: create entry on device A → wait 10 s → open on device B → confirm full notability content appears.

---

## Open questions you (user) might want to decide

1. **R14 performance budget enforcement.** Rules are in place; CI tooling (bundle-size check) is not. Is the order of operations: wire tooling first, then enforce? Or snapshot baseline now and let future PRs voluntarily cite?
2. **The AI provider layer refactor.** Agent C flagged it as a top structural finding. Do you want to ship it standalone before Phase 3 starts, or fold it into Phase 3 Week 2 (browser-side racing)?
3. **Notability file split.** PLAN's 5-way proposal is the wrong seams per Agent C. Should the next NotabilityEditor session instead extract the state reducer first, then re-evaluate the split?

---

## Opening prompt for the next Claude session

Paste this as your first message:

```
Read HANDOFF.md in the current repo, then ~/.claude/CLAUDE.md, then ./PLAN.md.
Summarize in 5 lines: what state the project is in, what the top 3 open
tasks are, and what you'll do first unless I tell you otherwise.
Don't start coding until I confirm your plan.
```

This forces the fresh session to load all three rule/context documents before taking any action, and to surface its interpretation before drifting.

---

## Who edits this file

Whoever ends a session that generated non-obvious decisions updates this file. "Non-obvious" means: a decision where the reasoning isn't captured by the code or the commit message alone. Specific bugfixes belong in commits; general rules in `~/.claude/CLAUDE.md`; the TODO list in PLAN.md.
