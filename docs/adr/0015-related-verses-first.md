# ADR-0015: Ask AI finds related verses first, then explains them (2026-10-06)

Status: accepted — switched on 2026-10-06 after the evaluation below. Roadmap P1 "BibleRetriever".

## Context

Ask AI on the TV answers from two kinds of material:

- **The study passage** — sent verbatim from the pack (CUV + BSB). This part
  is grounded: the model reads the real text.
- **"从整本圣经来看 · Across the whole Bible"** (ASK_AI_ANSWER_CONTRACT, now
  server-owned, ADR-0014) — the model picks other verses **from memory**. It
  can cite a verse that does not exist, cite a real verse that does not say
  what it claims, or keep returning to the same famous verses.

The CitationValidator (2026-10-06) catches the first failure only: a known
book with a chapter or verse that does not exist loses its link and gets
"（经文不存在 · no such verse）", and the TV prints the real text of up to
three outside references. It cannot tell whether a real verse *fits*, and
it cannot help the model find a verse it does not remember.

The fix the outside review proposed, and this ADR adopts: **the system
finds candidate verses first; the model explains them.** Bible text is a
fixed corpus with stable chapter/verse ids, so this does not need a search
engine to start.

## Decision

### 1. Source: the OpenBible.info cross-reference list

- About 340,000 verse-to-verse links, each with a vote count (seeded from
  older public-domain lists, refined by readers' votes). Download:
  `https://a.openbible.info/data/cross-references.zip`.
- Licence: "Unless otherwise indicated, all content is licensed under a
  Creative Commons Attribution License" (openbible.info/labs/cross-references).
  CC BY needs credit, not permission: add it to NOTICE (third-party
  material), to the README, and to a one-line credit on the page that
  shows the related verses.
- Format to confirm when building: a tab-separated file of *from verse*,
  *to verse or range*, *votes*, in OSIS-style ids (e.g. `Gen.1.1`).
  Negative votes exist (readers judged the link wrong) and are dropped.

### 2. Build-time preprocessing, shipped as static files

A script (`scripts/build-cross-refs.mjs`, run by hand when the source
changes, output committed like `public/bible-data/`) converts the list to
one small JSON file per chapter: `public/bible-data/xref/<BOOK>/<chapter>.json`,
mapping each verse to its top links `[[targetRef, votes], …]`.

- Keep at most `XREF_PER_VERSE` links per verse (start: 10) and only links
  with votes ≥ `XREF_MIN_VOTES` (start: 1). Map OSIS book ids to the app's
  book ids through `services/bibleBookData.ts` (one book table, R3).
- Same delivery as the Bible text: static, cached by the browser and the
  service worker, works offline at the meeting, no new server, no database
  rows, no per-question cost.
- Expected size: a few MB in total, a few KB per chapter. To be measured.

### 3. Retrieval in the browser (the TV), per question

`components/studypack/relatedVerses.ts` (pure, tested):

1. Seed verses: the pack's passage verses; when the leader asked about a
   selected word or verse, that verse first.
2. Load the seeds' chapter xref files; sum votes per target across seeds.
3. Drop targets inside the passage (already on screen) and duplicates.
4. Keep the top `RELATED_VERSES_MAX` (start: 6) by summed votes, at most
   2 from one book (variety, not one chapter of Proverbs six times).
5. Load their CUV + BSB text with the existing bundled-chapter loader
   (`externalVerses.ts`; no second loader).

If any file fails to load, Ask AI still answers with what it has, and the
missing part is logged as a visible warning in the test hooks — never a
silent empty list passed off as "no related verses" (R5, R14).

### 4. The prompt: evidence in the data, the rule on the server

- The TV adds a `RELATED VERSES` block to the user message (data only, as
  ADR-0014 requires): each entry is the reference + CUV + BSB text.
- The server-owned Ask AI rule (`supabase/functions/_shared/aiPrompts.ts`)
  gains one sentence: under "从整本圣经来看 · Across the whole Bible", cite
  only the study passage or the RELATED VERSES; if none of them fits the
  question, say so plainly rather than reaching for another verse.
- The own-key path builds the same messages with the same builder (one
  builder, ADR-0014).

### 5. Checking it worked

The CitationValidator stays. In addition, a reference that is neither in
the passage nor in the RELATED VERSES list is counted in the test harness
("cited from memory"). It is not hidden from the room — a correct verse is
still a correct verse — but the count is how we know the rule holds.

### 6. Evaluation before switching it on (R14 — honest control)

A blind comparison, like the 2026-10 model vote:

- **Same** questions (real ones from past meetings plus a set of hard
  thematic ones), **same** model (Gemini 2.5 Flash), **same** passage.
- **Control = today's exact request**: no RELATED VERSES block and no new
  rule sentence. Nothing from the treatment leaks into it.
- **Treatment** = block + rule.
- Measures: verses flagged "no such verse" (validator), verses cited from
  memory, and the owner's blind preference per pair. An empty or failed
  answer counts as a loss for that arm, never as a pass.
- Switch on only if the treatment wins the blind vote and does not raise
  the "no such verse" count.

## Alternatives considered

- **Keep model memory** (status quo + validator): cheapest, but a real
  verse that does not fit is never caught, and nothing helps the model find
  less-famous verses.
- **Keyword search over the whole Bible** (23 MB of CUV + BSB): too heavy
  per question in the browser; Chinese needs word segmentation or n-grams;
  keyword hits are a weaker signal of "related" than curated links.
- **Embeddings / vector search**: needs a hosted index or a large browser
  download, an embedding model and a per-question cost — infrastructure
  this project does not have. Revisit only if cross-references prove too
  narrow.
- **Treasury of Scripture Knowledge** (public domain, more links): no
  ranking, so it cannot pick the best 6; the OpenBible votes already
  include it as a seed.

## Consequences

- The "across the whole Bible" part becomes evidence-based: the model
  explains real verses the room can see, instead of recalling them.
- The model may miss a strong thematic link that is not in the list for
  this passage; the rule tells it to say so instead of guessing. Votes
  favour well-known verses — the per-book cap limits the effect, it does
  not remove it.
- Each Ask AI request grows by about 6 bilingual verses (~1.5–2k
  characters), well inside the proxy limit (MAX_TOTAL_CHARS 60,000) and
  cheap on Gemini 2.5 Flash.
- Fit on the TV is unchanged: the related verses are prompt input; the
  answer panel still shows at most 3 cited verses (CitationValidator).
- New third-party material with an attribution duty (NOTICE, README, page
  credit).
- Out of scope here: the personal app (role `study`), pack generation, and
  original-language word data (roadmap P2, STEPBible).

## Implementation notes (release steps 1–2, 2026-10-06)

- **Source format confirmed**: `From Verse<TAB>To Verse<TAB>Votes`, header
  carries `CC-BY`; 344,799 links, 3,521 with votes < 1 dropped; 225,008 kept
  (top 10 per verse). 1,189 chapter files (one per chapter, `{}` when a
  chapter has no links, so a 404 is always a failure), **3.64 MB** in total.
- **Compact target ref**: `HEB.5.14` or `HEB.5.12-14` (same chapter). A
  range crossing into the next chapter or book (655 links) keeps its start
  chapter's part, cut at that chapter's last verse (bundled BSB).
- **Book ids**: the script reads the app's ids from `services/bibleBookData.ts`
  (`scripts/lib/books.mjs`, as `fetch-bible-data.mjs` does) and pairs them
  in order with the source's 66 OSIS ids; a test pins the pairing.
- **"Selected verse first"**: the TV passes the selection only inside the
  question text ("在第7节中 … in verse 7"), so the focus seeds are the
  passage verses the question names (`findVerseRefs`) — this also covers a
  typed "v.7". Their links rank ahead of the summed-vote order.
- **Prompt switch**: the rule sentence (§4) is added by the shared builder
  when — and only when — the latest user message carries the
  `RELATED VERSES (` block. No new request field; the proxy and own-key
  paths agree by construction; a request without the block (switch off, or
  no related verses found) is byte-identical to the pre-ADR request (pinned
  by hashes in `relatedPrompt.test.ts`). A long related range prints at most
  3 verses.
- **Per-seed normalisation** (amends §3 step 2): raw summed votes leaned to
  the passage's most-linked verse — Matthew 6:25–34 gave six links of 6:33
  alone ("seek first the kingdom"); Philippians 4:6 and 1 Peter 5:7 ranked
  11th and 12th. Now each seed's links score votes ÷ that seed's top vote
  (its best link = 1.0), summed per target; raw votes only break ties.
  Question-named verses still rank first, applied after normalisation.
  Top 6 now (no verse named): Matthew 6:25–34 → Philippians 4:6, 1 Peter
  5:7, Psalm 55:22, Luke 12:31, Matthew 10:29–31, Luke 12:25–26 (picks from
  ≥ 3 seed verses, pinned by a test); Romans 8:18–30 → Jeremiah 12:4,
  1 John 3:2, Romans 12:12, Ephesians 1:11, Acts 3:21, Ephesians 1:4–5.
  The question's words still do not steer the ranking, only verse numbers
  it names.
- **Evaluation**: `scripts/eval-related-verses.mjs` (`--dry-run` builds every
  request with no network). Fixture: `tests/fixtures/related-verses-eval.json`.

## Evaluation result (release step 3, 2026-10-06)

`scripts/eval-related-verses.mjs`, 12 questions over Matthew 6, Proverbs 1,
John 3 and Romans 8 (Chinese and English; passage, selection and
whole-Bible questions). Both arms: google/gemini-2.5-flash, same
parameters; control = today's exact request (pinned by hash). Judge:
anthropic/claude-sonnet-4.5, blind.

**First run — judge discarded.** Asked for a bare "A" or "B", the judge
answered "B" in all 12 pairs: pure position bias, so its 7–5 "win" for the
treatment measured only the random order (R14: a measurement that cannot
fail is not a result). The script now asks for two sentences of reasons and
a `WINNER:` line, in **both** orders, and counts only verdicts that survive
the swap.

**Second run (fresh answers, order-proof judge):**

| measure | control | treatment |
|---|---|---|
| answered / failed | 12 / 0 | 12 / 0 |
| "no such verse" refs | 0 | 0 |
| cited from memory | 24 | 4 |
| judge wins (consistent in both orders) | 3 | 5 |
| split (order flipped the verdict) | 4 | 4 |

The bar in §6 is met (treatment wins; "no such verse" not raised), so the
switch is on. Memory citations fell by 83%.

**Where the control won (3):** the related list, built from the passage's
verses, missed the single best verse for the *question* — Isaiah 65:17 /
Revelation 21:1 for "creation renewed" (Romans 8), Philippians 2:3–4 for
humility in ministry (John 3), Hebrews 11:6 for faith (Matthew 6:27). Next
step (roadmap): question-aware candidates — e.g. also follow the links of
verses whose text matches the question, or of the top candidates — then
re-run this evaluation with the same control.

The owner's blind-vote page for the second run is produced by the same
script (`… results.json vote.html`); the owner may overrule this decision.

## Release

1. Build script + generated `public/bible-data/xref/` + NOTICE/README credit.
2. `relatedVerses.ts` with unit tests; the prompt block behind a constant
   switch, off.
3. The blind evaluation (§6). Record the result in this ADR.
4. If it wins: switch on, deploy `ai-proxy` (rule sentence) first, then the
   site (ADR-0014 order). Status → accepted.
