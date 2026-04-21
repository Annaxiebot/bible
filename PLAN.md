# Bible App — Plan & Standing Rules

> Living document. Update it whenever a decision is made, a rule earns an exception, or a migration phase ships.

---

## Part I — Hard Rules for AI-Assisted Development

These are non-negotiable. Every session — human or AI — must respect them. They exist because this codebase has accumulated real bugs from AI-written code that was locally correct but globally wrong. The rules trade short-term velocity for long-term sanity.

### R1. Delete before you add
Before any new feature, spend the first 15 minutes removing dead code, unused files, or duplicated logic relevant to the area you're about to touch. AI never volunteers deletion. The human must enforce it.

### R2. One session, one concern
A single session must not touch more than ~3 files across unrelated subsystems. If the change is sprawling, stop and spawn a focused agent, or split the work across sessions. Parallel AI sessions editing overlapping code produce merge conflicts and duplicated features — both have already happened in this repo.

### R3. No duplication of critical strings
Any string that must be identical in multiple places (system prompts, magic markers like `[SPLIT]`, config keys, SQL column lists) lives in exactly ONE file as an exported constant. This rule would have prevented the April 2026 `[SPLIT]` regression where the same prompt was copy-pasted into 5 service files and one was forgotten. The same pattern briefly recurred when `aiLanguageDirective.ts` was introduced to patch the duplication partially; the real fix landed in `services/systemPrompts.ts`.

### R4. File size budget
- Max 300 lines per file. Max 50 lines per function.
- If a file exceeds the budget, the next session that opens it must split it before adding features. Not "when we have time" — **before**.
- `NotabilityEditor.tsx` (2,700+ lines as of 2026-04) is the canonical violation. It is scheduled for split in Phase 0 below.

### R5. No silent error swallowing
Every `try/catch` must either (a) rethrow with context, (b) surface a user-visible error, or (c) write a one-line comment explaining why silent failure is correct here. `console.error` alone does not count — the user never sees it.

### R6. End-to-end tests over unit tests for product behavior
Unit tests catch local contract violations. They do not catch "the app doesn't sync" or "the English pane is stuck on Synthesizing…". A minimum of 10 e2e tests must exercise real user flows: create journal → sync → reopen on another device → see entry. Unit tests supplement these, not replace them.

### R7. Orphan files get deleted on sight
`.backup`, `.old`, `_v2`, stray HTML experiments, test scaffolds at repo root — all get deleted the moment they are noticed. Git history is the backup.

### R8. Refactor is a session, not a side task
When a session discovers that a refactor is needed, it does NOT do it alongside the feature. It creates a TODO entry (below), completes the feature as narrowly as possible, and the refactor gets its own session with no behavior changes.

### R9. Say no more often
Every accepted feature is a permanent tax on debugging. Before accepting work: ask whether the current feature set is actually stable first. If three known bugs exist in the current feature, do not start a fourth.

### R10. Log the reasoning, not just the code
Commits explain *why*, not just *what*. Future-you (and future-AI) need to reconstruct intent. Architectural decisions get an ADR in `docs/adr/` — not just a commit message.

---

## Part II — Active TODO Backlog

Legend: 🔥 P0 (product-blocking) · 🟠 P1 (important) · 🟢 P2 (when ready)

### Phase 0 — Cleanup

- [x] 🔥 Create PLAN.md (this file)
- [x] 🔥 Delete orphan files (`ChatInterface.tsx.backup`, stray HTML experiments — cleaned during parallel session)
- [x] 🔥 Consolidate `[SPLIT]` system prompts into `services/systemPrompts.ts`; delete superseded `services/aiLanguageDirective.ts`; migrate all 5 providers (`openai`, `claude`, `gemini`, `kimi`, `perplexity`, `openrouter`) to import from one source
- [ ] 🟠 Edge function (`supabase/functions/ai-chat/index.ts`) still has its own inline system prompt string — needs to import `BIBLE_SCHOLAR_SYSTEM_PROMPT` (Deno import path via relative URL or inline duplication with lint check — decide)
- [ ] 🟠 Split `components/NotabilityEditor.tsx` (2,700+ LOC) into:
  - `NotabilityEditor.tsx` (shell + state orchestration, ≤400 LOC)
  - `NotabilityCanvas.tsx` (drawing/stroke rendering)
  - `NotabilityTextBox.tsx` (single text box + toolbar)
  - `NotabilityAI.tsx` (AI action handler + connector lines)
  - `NotabilitySlashMenu.tsx` (slash command menu + executors)
- [ ] 🟠 Audit all `try/catch` blocks against R5 (no silent swallowing)
- [ ] 🟢 Remove Husky deprecation warning in `.husky/pre-commit` (remove the two flagged lines)

### Phase 1 — Observability & safety net (next)

- [ ] 🔥 Write 10 end-to-end tests covering:
  1. Create journal entry → persist to IndexedDB → reload → see entry
  2. Create entry → sync → open in second tab → see entry
  3. AI chat: send prompt → receive bilingual response → English pane populates
  4. AI chat: race mode selects fastest provider
  5. Slash command `/date` inserts today's date
  6. Notability text box: auto-fit height on content change
  7. Notability text box: iOS touch drag does not scroll page
  8. Journal title: inline edit saves via blur
  9. Weekly digest renders markdown as HTML
  10. Offline: create entry → go offline → reload → entry persists
- [ ] 🟠 Add a bottom-right status pill showing sync state (idle / syncing / offline / error with reason)
- [ ] 🟠 Instrument sync + AI failure paths with structured console events so bugs are debuggable by pasting console output
- [ ] 🟢 CI: run e2e tests on every PR; block merge on failure

### Phase 2 — Egress mitigation (before Drive migration lands)

These buy headroom so the Supabase free tier stays usable during the Drive migration.

- [ ] 🔥 `syncService.ts`: verify server-side filter `updated_at > lastSync` (not client-side after full download)
- [ ] 🔥 Journal list view: `select id, title, updated_at, location_name, verse_ref` only — do NOT fetch `notability_data` or `blocks` until an entry is opened
- [ ] 🟠 Move journal images from base64-in-row to Supabase Storage; in-row column holds only the storage path
- [ ] 🟠 Audit Realtime subscriptions — disable for any table that doesn't need push updates
- [ ] 🟢 Cache chat thread bodies in IndexedDB; only re-fetch when remote `updated_at` is newer

### Phase 3 — Migrate to Google Drive (flag-gated, parallel with Supabase)

Goal: Drive + IndexedDB replace Supabase entirely. User brings their own AI API keys. Racing runs in the browser. Edge functions deleted.

**Week 1 — Scaffold**
- [ ] Add setting `backend: 'supabase' | 'drive' | 'local-only'` (default: `supabase`)
- [ ] `services/googleAuthService.ts` — Google Identity Services (`gsi/client`) OAuth, scope `drive.appdata`
- [ ] `services/googleDriveSyncService.ts` — skeleton with interface matching `syncService.ts`
- [ ] Per-entry JSON files in `appDataFolder/journal/<id>.json`, no manifest (use Drive `modifiedTime` as index)
- [ ] ETag / `If-Match` conditional writes; 412 triggers merge-and-retry
- [ ] Explicit error handling for every Drive HTTP status (401, 403 quota, 403 rate-limit, 404, 412, 500)

**Week 2 — Browser-side AI racing**
- [ ] `services/browserRacingService.ts` — `Promise.any` over N provider calls with `AbortController` cancellation of losers
- [ ] Per-provider CORS verification matrix (OpenAI, Anthropic, Gemini, OpenRouter, Perplexity, Groq confirmed; others test)
- [ ] For CORS-blocked providers: optional tiny Cloudflare Worker proxy (free tier), NOT Supabase edge

**Week 3 — Data migration**
- [ ] One-time "Export to Drive" button: read all Supabase rows, write as Drive JSON files
- [ ] Images: download from Supabase Storage, upload to Drive as binary
- [ ] Verify round-trip on a test account before touching real data

**Week 4 — Flip default**
- [ ] Change default backend to `drive` for new users
- [ ] Leave Supabase read-only as safety net for 30 days
- [ ] Write ADR documenting the migration

**Month 2 — Decommission Supabase**
- [ ] Delete `supabase/functions/ai-chat/`
- [ ] Delete `services/syncService.ts` and Supabase client code
- [ ] Delete Supabase-related tests
- [ ] Update README; celebrate removing ~2,000 LOC

---

## Part III — Decisions & ADRs

Architectural decisions go in `docs/adr/`. Short form (Context → Decision → Consequences).

- **ADR-0001 (TODO):** Why Google Drive replaces Supabase for storage
- **ADR-0002 (TODO):** Why AI racing moves to the browser
- **ADR-0003 (TODO):** Per-entry files vs. manifest.json for Drive sync

---

## Part IV — Anti-goals (things we explicitly WILL NOT do)

- Multi-user / family sharing (breaks the Drive-only model; revisit later if needed)
- Self-hosted Supabase (adds ops burden; defeats the reliability goal)
- Server-side AI key pooling (requires a backend; user brings their own keys)
- Real-time collaboration (adds CRDT complexity; single-user is the explicit scope)
- Custom sync conflict UI (last-writer-wins per file is the chosen tradeoff)

---

## Part V — Session Log

Append a one-line note each session. This is the lightweight history that makes future sessions (human or AI) faster.

- **2026-04-20** Created PLAN.md, established hard rules, deleted orphans, started prompt consolidation (branch `cleanup-session`, paused for parallel-session conflict).
- **2026-04-21** Reconciled with 41 remote commits including parallel `aiLanguageDirective.ts`. Consolidated both into single `services/systemPrompts.ts`; deleted the interim directive file; migrated all 5 browser providers. Edge function still has inline prompt — queued as Phase 0 TODO.
