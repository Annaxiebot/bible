# Roadmap · 路线图

Updated 2026-10-06. Source: an outside review of the repo (security, AI grounding, architecture), each point checked against the code and the live database before it was listed here.

**Goal:** move Ask AI from a *prompt-centered* design (the model answers from memory, guided by rules) to an *evidence-centered* one (our own Bible data supplies the verses and word data; the AI explains them).

| Priority | Work | Size | Status / notes |
|---|---|---|---|
| **P0** | **Sign-up security.** The public key can insert sign-ups for any pack with any `leader_id`, then ask for a welcome email to any address (spam relay), and retire another person's sign-up by email. Fix: one `signup` edge function — leader looked up from the pack, rate limits per IP and per email, insert + replace + welcome in one call; direct inserts and the anonymous welcome closed. | Medium | **Done 2026-10-06** (ADR-0013): live, verified with a real sign-up. |
| **P1** | **CitationValidator — check references.** Drop references that do not exist (chapter/verse out of range); show the real CUV + BSB text in the answer (TV has no hover). Reuses `components/studypack/verseRefs.ts` and the bundled chapter files. Plain-text parsing, not JSON output (JSON broke pack generation before). | Small | **Done 2026-10-06**: a known book with a missing chapter/verse shows "（经文不存在 · no such verse）" and no link; the TV prints "引用经文 · Verses cited" (≤3 refs × 2 verses, CUV + BSB). Risk: a very long answer plus 3 refs can still need the thin scrollbar at 720p. |
| **P1** | **BibleRetriever — related verses first.** Start from the OpenBible.info cross-reference list (~340k ranked links, CC BY — verify licence): passage → top related verses with real text → the AI's "从整本圣经来看 · Across the whole Bible" may cite only those. No search engine needed at first. | Medium | **Done 2026-10-06** (ADR-0015): switched on after the evaluation — memory citations 24 → 4, no-such-verse 0 → 0, order-proof judge 5–3 (4 split). |
| **P1** | **Question-aware related verses.** ADR-0015's list comes from the passage's links, so it can miss the best verse for the *question* (Isaiah 65:17 / Revelation 21:1 for "creation renewed"; Philippians 2:3–4 for humility). Add candidates from verses whose text matches the question (or the links of the top candidates), then re-run `scripts/eval-related-verses.mjs` against the same control. | Medium | Next. |
| **P1** | **Server-side AI policy.** `ai-proxy` accepts any system message from the browser. The server should inject the official system prompt and answer rules per role (ask, pack, sharing). | Medium | **Done 2026-10-06** (ADR-0014; ai-proxy v8, then the site): scope guard + server system message for every role; Ask AI rules server-owned via `content_language`. Risk: language rule now sits in the system message — watch an English question on a zh-keywords pack. |
| **P2** | **Trustworthy client IP for per-IP limits.** `_shared/clientIp.ts` takes the first `x-forwarded-for` hop, which a script can set; find the header the Supabase edge sets itself (or the last hop) for `signup` and `feedback`. The database caps per pack and per email still bound abuse. | Small | **Done 2026-10-06**: probed live — the edge drops client-sent X-Forwarded-For / X-Real-IP and Cloudflare refuses a client CF-Connecting-IP, so the limit was not spoofable; `clientIp` now prefers `cf-connecting-ip`. |
| **P2** | **WEB → BSB in search.** `services/bibleSearchService.ts` still types and searches `'web'`; use the shared translation type and `DEFAULT_ENGLISH_VERSION`. | Small | **Done 2026-10-06**: English search reads the chosen version (BSB by default) via `chosenEnglishVersion()`. |
| **P2** | **One shared answer per check-in.** `share_checkin_answer()` has no uniqueness; keep the latest answer per signup × check-in kind (upsert). | Small | **Done 2026-10-06**: unique (signup_id, kind) + upsert, applied live. |
| **P2** | **Retire `[SPLIT]`.** The personal app's two-pane answer depends on a text marker, and its prompt contradicts itself on language. Move to structured output. | Medium | ~14 call sites. |
| **P2** | **Greek/Hebrew grounding.** Open data: STEPBible TAGNT/TAHOT (lemma, Strong's, morphology, gloss; CC BY). Clean for English (BSB); a selected Chinese (CUV) word needs approximate matching. | Large | Later. |
| **P2** | **Split the personal app from the group app.** `App.tsx` and `Sidebar.tsx` are far over the size budget; draw domain boundaries (study / bible / shared core). | Large | Refactor session, no behaviour change. |

## Done in this round (2026-10-06)

- History rewritten (email and tokens removed), old branches and tags deleted.
- Leaked keys: Supabase tokens revoked (verified 401); Gemini keys dead; Kimi key disabled (no balance).
- GitHub secret scanning and push protection on; private vulnerability reporting on; unused repo secrets deleted.
- Deploys keep the previous build's bundles one round (no blank page after a deploy).
