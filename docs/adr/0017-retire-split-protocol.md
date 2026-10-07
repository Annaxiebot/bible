# ADR-0017: Retire [SPLIT] — one module owns the bilingual answer protocol (2026-10-06)

Status: accepted. Roadmap P2 "Retire [SPLIT]".

## Context

The personal app's chat (#app, AI role `study`) shows each answer in two
panes, 中文 and English. The model was told to write the exact string
`[SPLIT]` between the two halves, and four places split on it by hand
(`chatBibleReferences.parseMessage`, `autoSaveResearchService`,
`GeneralResearchDialog`, plus the TV's `stripSplitMarker`). A missing or
mangled marker left the English pane on "Synthesizing English commentary…"
forever (the April 2026 regression, fixed in `828963f6`). The prompt also contradicted
itself: "two sections, Chinese then English" and, appended,
`AI_LANGUAGE_DIRECTIVE` "write your response in Simplified Chinese as the
primary language … this applies to every response".

Chat threads (IndexedDB `chat_history`, synced to Supabase, ADR-0010) store
the raw answer, so old threads hold `[SPLIT]`. Saved research holds `[SPLIT]`
only in old entries (auto-save has joined the halves with `---` since 2026-04).

## Options

- **A. Structured output** (`{"zh": "...", "en": "..."}`, partial-JSON
  streaming). The `study` allowlist is Gemini 2.5 Flash, Flash Lite,
  DeepSeek V3 and `openrouter/free` (a router to whichever free model is up),
  and an own-key user may pick any OpenRouter model. `response_format` is
  per-provider on OpenRouter and not guaranteed for the router or DeepSeek
  providers; a model that ignores it, or a reply cut at `max_tokens`, gives
  invalid JSON with markdown escaped inside strings. It also changes the
  answer the model writes (long markdown inside JSON strings). Rejected: the
  failure mode moves, it does not go away, and the blast radius is larger.
- **B. Explicit section headings, one tolerant parser.** Chosen.
- **C. Two calls.** Doubles cost and the monthly `study` quota. Rejected.

## Decision

1. **Protocol.** The answer is markdown with two headings on their own lines:
   `## 中文` then `## English` (`services/bilingualAnswer.ts`, the only
   module that knows them). Headings are what models write naturally and
   render as headings if they leak, unlike `[SPLIT]`.
2. **One parser** `splitBilingualAnswer(text, { partial })` → `{ zh, en }`:
   - tolerant: `#`–`######`, `**English**`, `English:`/`English：`, case,
     "English section", `英文`; the Chinese heading likewise (`中文`, `Chinese`);
     either order. A bare `English` / `中文` line with no `#`, bold or colon
     is text, not a heading (a Chinese answer may contain the word alone);
   - legacy: a `[SPLIT]` (also `［SPLIT］`, any case, inline) splits too — the
     one legacy-read path for old threads and old research;
   - fallback: no English heading → everything in the Chinese pane, never
     lost; `en` is `null` and the English pane shows the muted
     "无英文部分 · no English section";
   - streaming (`partial: true`): text before the English heading goes to the
     中文 pane live; a trailing line that could be the start of a marker
     (`## Eng`, `[SPL`) is held back until it completes, so no marker flashes.
3. **One language rule.** `BIBLE_SCHOLAR_SYSTEM_PROMPT` states the two
   sections, Chinese first, English keywords in parentheses in the Chinese
   section — and nothing else about language. `AI_LANGUAGE_DIRECTIVE`
   (Chinese-only) leaves the scholar prompt; it becomes
   `JOURNAL_LANGUAGE_DIRECTIVE`, the journal's existing user-prompt prefix
   moved here (its duplicate in `journalAIService` deleted, R3), minus the
   dead "Do NOT use the [SPLIT] format" sentence.
4. **History.** Old assistant turns sent back to the model are rewritten to
   the heading form (`toHeadingForm`), so the model is never shown `[SPLIT]`.
5. **Dead code (R1).** `SPLIT_MARKER`, the hand-written splits, the
   "Analysis in progress..." sentinel, and the TV's `stripSplitMarker` go.
   Ask AI has sent its own server-owned prompt since 2026-10-04 (ADR-0014),
   which already says "no [SPLIT] marker"; nothing asks any model for it.

## Compatibility

- No server change: the `study` role keeps the browser's system message
  after the scope guard (ADR-0014 §3), so the new prompt rides the next site
  deploy. `ai-proxy` needs no redeploy (only a comment in `policy.ts` changed).
- There is no runtime-editable chat prompt to migrate (the "editable" prompt
  of ADR-0014 §3 is the source constant). A cached old bundle still sends the
  old prompt and gets `[SPLIT]` answers, which it parses itself; the new
  bundle parses both forms.

## Consequences

- A model that drops the English heading loses only the English pane, with a
  visible note, never the answer.
- The TV's Ask AI no longer strips `[SPLIT]`; if a model ever wrote it there
  it would show as text (none has since ADR-0014).
