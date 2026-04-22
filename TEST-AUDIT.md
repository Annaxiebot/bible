# Test Audit — First-Pass Verdict

**Date:** 2026-04-21
**Author:** bootstrap session (Mac mini)
**Scope:** every file under `**/__tests__/**/*.test.{ts,tsx}` and `**/*.test.{ts,tsx}`, excluding `node_modules`, `dist`, `tests/e2e`.

---

## The numbers

| Metric | Value |
|---|---|
| Test files | 52 |
| Total tests (`it` + `test`) | 861 |
| Total mock sites (`vi.mock` / `vi.fn`) | 529 |
| Mean mock ratio (mocks per test) | 0.61 |
| Full suite runtime | **3.23s** (vitest run, not 30s as HANDOFF.md claimed) |

Corrects HANDOFF.md assertion that tests take ~30s — they don't. The 30s figure was pre-retirement of the `.husky/pre-commit` hook and likely included environment setup. Today the corpus runs under 4 seconds end-to-end. The speed concern is settled; the **quality** concern per R6 is open.

---

## Verdict by category

### A. Keep as-is (pure logic, no mocks)
These exercise real behavior in pure functions. High regression-catch value per test. Aggressively keep.

- `services/__tests__/chineseConverter.test.ts` (14 tests, 0 mocks)
- `services/__tests__/chatBibleReferences.test.ts` (10 tests, 0 mocks)
- `services/__tests__/bibleBookData.test.ts`
- `types/__tests__/journalBlocks.test.ts`
- `services/export/__tests__/backupSummaryParser.test.ts`
- `services/__tests__/customizationService.test.ts` (ratio 0.67, but asserts real behavior)
- `utils/__tests__/retryUtils.test.ts` (ratio 1.0 but legitimate — `vi.fn` is the fixture, not the subject)

### B. Keep — integration with legitimate external mocks
These mock the network / Supabase, but the assertions test actual protocol handling (message shape, retry logic, error paths). Still catch real protocol regressions.

- `services/__tests__/openrouter.test.ts` — mocks `fetch`, tests request/response shape; would catch `[SPLIT]`-class regressions if asserted on system-prompt content (does it? verify).
- `services/__tests__/claude.test.ts` — same shape.
- `services/__tests__/kimi.test.ts` — same shape.
- `services/__tests__/systemPrompts.singleSource.test.ts` — the R3 tripwire shipped in PR #4.

### C. Demote to `test:slow` or DELETE — mock-shuffle
Tests whose mocks ARE the subject. A test that sets up a mock returning X and then asserts "the mock returned X" catches nothing. These are the ones HANDOFF.md calls out as "false confidence."

Top offenders by mock ratio (mocks per test):

| Ratio | Tests | File | Verdict |
|---|---|---|---|
| 9.0 | 4 | `services/__tests__/webSearch.test.ts` | DELETE — 36 mocks for 4 tests; almost certainly pure mock-shuffle |
| 4.8 | 5 | `hooks/__tests__/useBibleDownload.test.ts` | DEMOTE to `test:slow`; spot-check what's asserted |
| 3.5 | 11 | `hooks/__tests__/useBibleContextMenu.test.ts` | DEMOTE |
| 3.2 | 20 | `components/__tests__/GeneralResearchDialog.test.tsx` | DEMOTE |
| 2.0 | 17 | `components/__tests__/JournalPrintDialog.test.tsx` | Review |
| 2.0 | 5 | `services/__tests__/perplexity.test.ts` | Review (protocol test? then keep) |
| 2.0 | 4 | `services/__tests__/tavily.test.ts` | Review |
| 2.0 | 4 | `services/__tests__/brave.test.ts` | Review |
| 0.9 | 30 | `services/__tests__/journalRealtimeSync.test.ts` | DEMOTE — fully mocks Supabase; would NOT have caught the 97%-egress issue |
| 0.9 | 27 | `services/__tests__/syncService.test.ts` | DEMOTE — same |
| 0.8 | 25 | `services/__tests__/autoSaveResearchService.test.ts` | DEMOTE |

### D. Not audited
30+ files below ratio 0.5 are not individually categorized in this pass. They're probably a mix; they'll need one-by-one review.

---

## What this audit does NOT do (and why)

- **Does not delete or demote anything** — moving 100+ tests without per-file review is how you lose a test that quietly catches a real regression you've forgotten about. Each proposed deletion needs a `git log --follow` on the file and one question: "has this file ever been the commit that caught a bug?" If yes, keep. If no, demote.
- **Does not measure regression-catch rate** — that would need a replay of the last 6 months of production incidents (SPLIT, sync, pencil, egress) against each test to see if any would have failed pre-fix. That's a 3-hour exercise on its own, already queued in PLAN.md Phase 0.
- **Does not add `test:slow` script** — would be premature before knowing which files to route there.

---

## Recommended next action (single session)

1. Create `npm run test:slow` script that includes `**/*.slow.test.ts` only.
2. For each file in category C above: rename `X.test.ts` → `X.slow.test.ts`. Run both suites; confirm nothing regresses.
3. Commit in small batches (≤3 files per commit) so any unexpected signal is easy to bisect.
4. After demotions, re-measure: fast suite should drop ~150 tests; slow suite collects them. The goal per PLAN is ≤150 in fast.

---

## Regression-catch replay exercise (future work)

Hand-pick 5 real production incidents with known commits:
- `[SPLIT]` OpenRouter regression (commit `6b26e7d`)
- Sync race condition (commit `97d48a6`)
- Apple Pencil in journal (commit `ab9775f`)
- Stroke drops / lasso amplification (commit `9f9889b`)
- Egress blow-up (no fix commit yet; open issue)

For each, check out the pre-fix commit, run `npm test`, observe whether any existing test fails. Record the result. Tests that fail = prove their worth. Tests that passed through all 5 = candidates for deletion. This is the concrete "weight" metric HANDOFF.md asks for.
