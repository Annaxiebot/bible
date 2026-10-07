# ADR-0016: Ask AI picks the related verses for the question (2026-10-06)

Status: evaluated 2026-10-06 — NOT switched on (`QUESTION_AWARE_ENABLED` stays
false); the bar in the Evaluation section was not met. See "Evaluation result".
The switch lives in `components/studypack/relatedPick.ts`. Amends ADR-0015 §3
step 4. Roadmap P1 "Question-aware related verses".

## Context

ADR-0015 gives Ask AI six related verses from the passage's OpenBible.info
cross-references, ranked by readers' votes (per-seed normalised). Its
evaluation won, but the three pairs the control won had one cause: the vote
ranking does not know the question. The verse that answers it best is
usually **in the pool already**, just below the top 6:

| passage | question about | best verse | its rank in the pool |
|---|---|---|---|
| Romans 8:18–30 (pool 101) | a renewed creation | Isaiah 65:17 / Revelation 21:1 | 40 / 38 |
| John 3:22–36 (pool 126) | humility in ministry | Philippians 2:2 | 34 |
| Matthew 6:25–34 (pool 71) | faith and the kingdom | Romans 14:17 | 37 |

(Pool = `rankPool`, overlapping ranges removed; counted before that, the
pools were 112 / 131 / 78 and the ranks 46 / 42, 34, 40. Every one of these
verses is inside the first `RELATED_POOL_MAX` = 120.)

So the cheapest fix is not a bigger search but a better choice from the
list we already have.

## Decision

1. **Pool.** Build the candidates as today (seed links, per-seed normalised
   scores, passage verses and overlapping refs removed), but keep them all
   in rank order (`relatedVerses.rankPool`); the pick call sees the first
   `RELATED_POOL_MAX` (120).
2. **A short first AI call, role `pick`.** The server owns its system text
   (`PICK_SYSTEM_PROMPT` in `supabase/functions/_shared/aiPrompts.ts`,
   after the scope guard, ADR-0014): from the CANDIDATES only, choose up to
   6 that best help answer the QUESTION for a small group studying PASSAGE,
   relevance over fame, references only, one per line, exactly as written.
   The user message is data (`formatPickRequest`): passage, question, and
   one `REF label` line per candidate (`ISA.65.17 以赛亚书 65:17 · Isaiah 65:17`)
   — no verse text, so the call stays small (~120 lines of ~30 characters).
   Policy (`ai-proxy/policy.ts`): model = the Ask-AI model, allowlist =
   Ask AI's, `ROLE_MAX_TOKENS.pick = 160`, `DEFAULT_MONTHLY_LIMITS.pick = 600`
   (secret `AI_MONTHLY_PICK`). Streamed through the same transport as the
   answer (own key → OpenRouter; signed in → ai-proxy), temperature 0,
   reasoning off.
3. **Parse strictly.** Keep only lines that exactly match a candidate (its
   code, or its whole list line); anything else, and repeats, are ignored
   and counted. At most 6; at most `RELATED_PER_BOOK` per book; fewer than
   6 → filled from the vote ranking. The final six get their 和合本 + BSB
   text from the existing loader, and the answer call is exactly ADR-0015's
   (RELATED VERSES block + rule sentence).
4. **Never block the answer.** A pick error (including 429 quota), an
   empty or all-invalid reply, or a call slower than `PICK_TIMEOUT_MS`
   (3000) → ADR-0015's vote top 6. The result carries
   `source: 'pick' | 'votes'` and the reason in `warnings`
   (`lastRelatedVerses()`, `window.__RELATED_VERSES__` in dev) — never silent (R5).
5. **Switch.** `QUESTION_AWARE_ENABLED` (one constant), default **false**:
   no pick call, and the answer request is byte-identical to ADR-0015's
   (SHA-256 of the sent body pinned from master 118d5ad0 in
   `relatedPickRequests.test.ts`).
6. **Own-key parity.** The own-key path builds the pick's final messages
   with the same builder (`aiTransport.ownKeyBody('pick', …)`); a test pins
   them equal to the proxy's.
7. The TV's hint and the OpenBible.info credit are unchanged.

## Alternatives considered

- **Keyword match on verse text** (follow links of verses whose words match
  the question): needs Chinese segmentation, and words are a weak signal of
  "answers the question" — "creation" matches the passage itself.
- **Send the verse text of all candidates and let the answer call choose**:
  ~120 bilingual verses ≈ 30–40k characters per question — near the proxy's
  60k limit, slower, and the answer model would cite more, not better.
- **Embeddings**: the infrastructure ADR-0015 already rejected.
- **A larger top-N in the answer prompt (e.g. 20)**: more of the right
  verses, but also more noise for a 4-sentence answer; the pick keeps the
  answer prompt the same size.

## Consequences

- One extra small AI call per question (the answer waits for it, at most
  3 s). Cost: ~3–4k input tokens + ≤160 output on Gemini 2.5 Flash.
- A new quota role: `ai_usage`'s role CHECK must allow `pick`
  (`database/ai-usage-pick-role.sql`) before the proxy is deployed, or
  every pick call fails (and falls back — the answer is never lost).
- `#/setup`'s usage line shows "选经文 n/600" once a leader has a pick row.
- The model now influences which verses are shown; the strict parser means
  it can only choose from the curated list, never introduce a verse.

## Evaluation (before switching on, R14)

`scripts/eval-question-aware.mjs` (shares `scripts/lib/evalRun.mjs` with
ADR-0015's script, so both evaluations measure and judge with one code) — CONTROL = today's ON behaviour (vote
top 6), TREATMENT = question-aware picks; same model, parameters, passage
and question; the arms differ only in the RELATED VERSES list. Same fixture
and order-proof judge as ADR-0015. Reports per arm: answered / failed,
"no such verse", cited from memory (against that arm's own list), judge wins
and splits; for the treatment, how often the pick was used vs fell back (and
why); both related lists side by side in the results JSON; the blind-vote page.

Switch on only if the treatment wins the order-proof judge, does not raise
"no such verse" or "cited from memory", and the pick path is used for most
questions (a mostly-fallback run measures nothing).

Run (costs OpenRouter credit: 1 pick + 2 answers + 2 judge calls per question):

    OPENROUTER_API_KEY=… node scripts/eval-question-aware.mjs results-0016.json vote-0016.html

`--dry-run` (no key, no network) prints each question's pool size, the pick
request size and the vote top 6. Pools on the fixture: Matthew 6 71,
Proverbs 1 144 (pick sees 120), John 3 126 (120), Romans 8 101; pick
requests 4.1–6.0k characters.

Result: not yet run.

## Evaluation result (2026-10-06)

`scripts/eval-question-aware.mjs`, the same 12 questions as ADR-0015.
Control = today's ON behaviour (vote top 6); treatment = question-aware
picks. Same model (google/gemini-2.5-flash) and parameters; judge
anthropic/claude-sonnet-4.5, asked in both orders, only order-proof
verdicts count.

| measure | control (votes) | treatment (pick) |
|---|---|---|
| answered / failed | 12 / 0 | 12 / 0 |
| "no such verse" refs | 0 | 0 |
| cited from memory | 5 | 2 |
| judge wins (consistent) | 5 | 3 |
| split (order flipped it) | 4 | 4 |
| pick path used | — | 12 of 12 (~0.8 s each; no fallback) |

**Decision: keep it off.** The bar (treatment wins the order-proof judge)
was not met, and the bar is not moved after seeing the result (R14).

**What the run shows, for the next attempt:**
- The picks fit the questions better on inspection — Romans 8 "why does
  creation groan" → Genesis 3:17–19, Isaiah 65:17, Revelation 21:1 (votes:
  Jeremiah 12:4, Ephesians 1:4–5); John 3 "he must increase" →
  Philippians 2:9–11, 1 Peter 4:10–11 (votes: Matthew 28:18, Isaiah 54:5).
- Where the control won, the judge's reasons point at verses the control
  answer cited **from memory, outside both lists** — 2 Thessalonians 3:10
  and Genesis 2:15 (work), Proverbs 6:6–8 (planning). They are not in the
  passage's cross-reference pool at all, so better picking cannot supply
  them; the judge also rewards breaking the "cite only these" rule.
- n = 12 with 4 splits: too small to separate a 5–3 from noise.

**Next attempt (not started):** (1) a larger fixed question set (≥30)
written before the run; (2) widen the pool beyond the passage's own links
(e.g. one more hop from the top candidates) so thematic verses like
2 Thessalonians 3:10 can enter; (3) re-run against the same control and
the same unchanged judge.

Release state: the code (pick role, prompt, parser, fallback, eval script)
is merged behind the switch; `database/ai-usage-pick-role.sql` is NOT
applied and `ai-proxy` has NOT been redeployed with the `pick` role, so no
pick call can happen in production.

## Release

1. Code + tests, switch off (this change). Apply nothing yet.
2. Run the evaluation; record it here.
3. If it wins: apply `database/ai-usage-pick-role.sql`, deploy `ai-proxy`
   (role `pick`), then set the switch on and deploy the site (ADR-0014
   order). Status → accepted.
