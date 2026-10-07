# ADR-0018: Original-language word data for Ask AI (2026-10-06)

Status: proposed — release steps 1–2 built, switch OFF (`ORIGINAL_WORDS_ENABLED`
in `components/studypack/originalWords.ts`). Not evaluated yet. Roadmap P2
"Greek/Hebrew grounding".

## Context

When the leader selects a word on the TV, Ask AI asks for "the original-language
sense (Hebrew/Greek, transliterated)" (`ASK_AI_ANSWER_CONTRACT` rule 3;
`askAI.questionForSelection`). The model answers that part **from memory**. It
can name the wrong Greek word (the lemma of a neighbouring verse, a famous
word that is not in this verse), invent a transliteration, or give a Strong's
number that does not belong. Nobody in a small group can check it on the spot.

ADR-0015 showed the cure for verses: the system supplies the evidence, the
model explains it, and a server-owned rule keeps it to that evidence. This
ADR does the same for words.

## Decision

### 1. Source: STEPBible-Data (CC BY 4.0)

<https://github.com/STEPBible/STEPBible-Data>, by Tyndale House Cambridge /
www.STEPBible.org, licensed CC BY 4.0 ("Include any part of this data in
software or publications without requesting permission"). Pinned commit
`1f3423d4` (2026-10-05). Credit reads **"STEP Bible"** linked to
www.STEPBible.org: NOTICE, README, and one small line in the Ask AI panel
shown only while the switch is on, next to the OpenBible.info credit.

Files used (tab-separated text with long licence/notes headers, which are skipped):

| file | what | columns used |
|---|---|---|
| TAGNT Mat-Jhn, TAGNT Act-Rev | Greek NT, one line per word | 0 `Jhn.3.16#07=NKO` (ref, word no, text type) · 1 `κόσμον, (kosmon)` (Greek + translit) · 2 `world,` (English, from BSB) · 3 `G2889=N-ASM` (dStrong = grammar) |
| TAHOT Gen-Deu, Jos-Est, Job-Sng, Isa-Mal | Hebrew OT, one line per word | 0 `Psa.23.1#04=L` · 1 `רֹ֝עִ֗/י` (Hebrew, `/` between prefix/root/suffix, `\` before punctuation) · 2 `ro.'/I` (translit) · 3 `[is] shepherd/ my` · 4 `{H7462B}/H9020` (root in braces) · 5 `HVqrmsc/Sp1bs` (grammar) |
| TBESG, TBESH | brief lexicons | 0 eStrong · 1 dStrong (`H4148H = a Meaning of`) · 3 lemma · 4 translit · 6 gloss · 7 meaning (HTML; BDB outline for Hebrew, Abbott-Smith for Greek) |

A word line is recognised by `^<Book>.<ch>.<v>[(…)|[…]|{…}]#<n>=<type><TAB>`;
interlinear rows (`# …`, `#_…`), column-header rows and notes are skipped.
The reference is the English (NRSV) versification; a bracketed alternative
(Hebrew `(23.2)`, KJV `[17.14]`, other `{8.1}`) is ignored.

### 2. Build-time preprocessing, static files

`scripts/build-original-words.mjs` (run by hand when the source changes;
helpers `scripts/lib/stepWords.mjs`, `scripts/lib/stepLexicon.mjs`, tested on
fixture lines copied from the real files) downloads into a temp dir (never
committed) and writes:

- `public/bible-data/orig/<BOOK>/<chapter>.json` for **every** chapter of the
  app's book table (a 404 is always a failure): `{ "<verse>": ["original|translit|strong|morph|gloss", …] }`
  in text order.
- `public/bible-data/orig/lexicon-greek.json`, `lexicon-hebrew.json`:
  `{ "<Strong's>": [lemma, translit, brief] }`, only the ids the words use.

Rules (each one a choice; all documented in the scripts):

- **Book ids.** STEP's 66 ids (`Gen`…`Rev`) are paired in order with the
  app's table (`services/bibleBookData.ts` via `scripts/lib/books.mjs`, one
  book table); a test pins the pairing (each is the app id in title case).
- **Greek words kept:** the Nestlé-Aland text (type has N or n outside
  brackets: `NKO`, `N(k)O`, `no`), because the app's English text (BSB)
  follows it; Textus-Receptus-only or other-edition words (`K`, `ko`, `O`)
  are dropped (3,884). **Exception:** a verse with no NA word at all
  (Mark 16:9–20, John 7:53–8:11, Matthew 17:21, Acts 8:37 …) keeps its
  Traditional-text words (type has K/k), since the bundled BSB or 和合本 still
  prints those verses.
- **Hebrew words kept:** every line — TAHOT already gives the translators'
  reading (Qere over Ketiv; LXX additions marked X). A Qere that reads nothing
  (Judges 16:25 #02: empty word and tags) is skipped.
- **Hebrew prefixes and suffixes stay attached to their word** as the data
  prints it (וּמוּסָר "and discipline" is one word). Shown: the Hebrew without
  accents (cantillation, meteg), punctuation after `\`, or the `/` marks;
  the transliteration without syllable dots or `/`, lower-cased (STEP marks
  stress with a capital: `yir.'At` → `yir'at`). The gloss and morphology keep
  their `/` (`and/ discipline`, `HC/Ncmsa`) so the parts stay visible. The
  Strong's id is the **root** (the `{…}` tag); prefix/suffix tags (H9001–H9049)
  are not words of their own.
- **Greek form:** punctuation after the word and apparatus marks removed (the
  elision mark ᾽ stays); translit from the brackets; gloss = the English
  column without trailing punctuation.
- **All text NFC** (the source mixes Greek oxia and tonos for one accent).
- **Psalm titles** (English verse 0) are kept with verse 1, where the bundled
  BSB and 和合本 print them.
- **Morphology for verbs only** (Greek `V-…`; Hebrew `…V…`): tense, mood and
  stem are what a word study explains; nouns' case/state would cost ~2 MB.
- **One string per word**, fields joined by `|` (no field contains it — the
  build checks): JSON arrays of five strings cost ~4 MB more over 443k words.
- **Lexicon brief** (`stepLexicon.mjs`): `gloss: meaning`, ≤ 200 characters.
  Hebrew: the BDB outline with `<br>` → `; `. Greek: Abbott-Smith without its
  first line (endings/article), without `[in LXX …]` notes, verse references,
  brackets citing classical authors or reference works (`(Hom., Plat., al.)`),
  `al.`/`ib.`, `†`; HTML removed, doubled punctuation tidied. A gloss that
  repeats the meaning's first words is said once. Over 200: cut at the last
  `; ` / `. ` / space that fits, then `…`. Lookup: the exact disambiguated id
  (H4148H), else the first entry of its plain number (G3700 for G3700G).

**Result (2026-10-06):** 138,212 Greek + 305,634 Hebrew words; 1,189 chapter
files; 5,557 Greek + 11,423 Hebrew lexicon entries, none missing. **21.00 MB**
on disk (lexicons 2.46 MB), ~6 MB gzipped. Slightly over the ~20 MB target:
dropping verb morphology as well gives ~19.9 MB (one line,
`stepWords.keptMorph`) — kept, because "do not worry" being an aorist
subjunctive prohibition (Matthew 6:34) is the kind of point a word study
makes. A question downloads one chapter file (Matthew 6: 23 KB) and, once per
session, one lexicon (Greek 0.87 MB / Hebrew 1.72 MB; 0.3 / 0.46 MB gzipped).

Versification against the bundled BSB: one BSB verse has no words
(2 Corinthians 13:14 — NRSV puts its words in 13:13); 18 word verses are not
in the BSB (TR-only verses such as Matthew 17:21 that 和合本 prints, plus
3 John 1:15 and Revelation 12:18, which BSB numbers differently). Harmless:
only verses the question targets are read.

### 3. Which verses a question gets (`originalWords.targetVerses`, pure)

- The passage verses the question **names** — a selection's "在第7节中 · in
  verse 7", or a typed "第7节", "v.7", "verse 7" (the same `focusVerses` as
  ADR-0015) — at most `ORIGINAL_WORDS_MAX_VERSES` = 2.
- Else, for a **selection** question with no verse ("「明天」在这段经文中…"),
  the passage verses whose 和合本 or English text contains the selection, at most 2.
- Else **none**: a general question sends no word data — no fetch, no block,
  the request stays today's byte for byte, and requests stay small.

### 4. The prompt: data in the user message, the rule on the server

- The TV adds an `ORIGINAL WORDS (` block after RELATED VERSES (data only,
  ADR-0014), built by the shared builder `_shared/aiPrompts.formatOriginalWordsBlock`:
  per verse `[约翰福音 3:16 · John 3:16 · Greek]`, then one line per word:
  `kosmon (κόσμον) · G2889 · world — κόσμος (kosmos): world: 1. order. 2. …`
  (`translit (original) · Strong's · morph (verbs) · gloss — lemma (translit):
  brief`, the lexicon part once per Strong's number in the block). John 3:16
  adds ~5k characters; the fixture's treatment requests are 7.6–13.4k
  characters (proxy limit 60k).
- The server adds **one rule** when — and only when — the latest user message
  carries the block (`hasOriginalWordsBlock`), numbered 8 after the related-verses
  rule (7 without it): "ORIGINAL WORDS: When you explain a word's
  original-language sense, use only the ORIGINAL WORDS for that verse: name
  the word, its transliteration and Strong's number as given; if the selected
  Chinese or English term matches none of them, say so rather than guessing."
- Own-key and proxy build the same final messages (one builder; pinned).

### 5. Failures are visible, never silent (R5)

A failed chapter load → no block and a warning; a failed lexicon → the words
without meanings and a warning; a verse with no words or an id the lexicon
lacks → a warning. `lastOriginalWords()` and, in dev, `window.__ORIGINAL_WORDS__`
hold the latest result. The answer always goes ahead.

### 6. Switch

`ORIGINAL_WORDS_ENABLED = false` in one place. Off ⇒ no word file is fetched
and every request is byte-identical to master 68fd93d0: SHA-256 of the own-key
POST body and of the proxy's final messages, for a selection question with a
verse, one without, a typed "第27节" and a general question
(`originalWordsRequests.test.tsx`). With the switch on, a general question is
still that same request.

## Evaluation (before switching on, R14) — written before any run

`scripts/eval-original-words.mjs`, fixture `tests/fixtures/original-words-eval.json`
(18 word questions written 2026-10-06 before any run: 14 selections as the TV
asks them, 4 typed, Chinese and English, 7 OT + 11 NT — Proverbs 1:7 敬畏,
John 3:16 世人 / 独生子, John 3:3 "born again", John 4:34 食物, Romans 8:28
益处 / 8:22 "groans", Psalm 23:1 牧者 / "want", Matthew 6:34 忧虑 / 6:33 求,
Genesis 1:1 创造, Isaiah 40:31 等候, Philippians 4:6 挂虑, Ephesians 2:8 恩,
Micah 6:8 怜悯, Hebrews 11:1 实底).

- **Control = today's exact request** (switch off; the related verses the TV
  sends today). **Treatment** = the same + the ORIGINAL WORDS block (+ the
  rule). Same model (google/gemini-2.5-flash), sampling, passage, question;
  the script throws if the control carries the block or the arms differ
  outside the messages.
- Per arm: answered / failed (empty = failure, loses its pair), "no such
  verse", cited from memory, Greek/Hebrew forms mentioned and how many are in
  the verse data (`lexicalAccuracy.ts`; both arms checked against the same
  word list), and the order-proof judge (anthropic/claude-sonnet-4.5, both
  A/B orders, only consistent verdicts count) asked: "Which answer better
  explains the word for a church small group: accurate original-language
  sense, clear, faithful to Scripture?". Plus a blind-vote page for the owner.
- **Bar to switch on:** the treatment wins the order-proof judge; its lexical
  accuracy % is higher than the control's; "no such verse" and failures do
  not rise; every question's treatment carried the block. The bar is not
  moved after seeing the result.

Run (costs OpenRouter credit: 2 answers + 2 judge calls per question):

    OPENROUTER_API_KEY=… node scripts/eval-original-words.mjs results-0018.json vote-0018.html

`--dry-run` (no key, no network) prints each question's target verses, word
count and both request sizes. Result: not yet run.

**What the lexical check counts** (`lexicalAccuracy.ts`): every run of Greek
or Hebrew letters, every Strong's number, and Latin words that are one of the
data's transliterations (≥ 4 letters) or look like one (macron/breve or inner
apostrophe, in brackets after a Greek/Hebrew form, after "Greek / Hebrew /
希腊文 / 希伯来文 / 原文"). Matching ignores case, accents, vowel points and
punctuation, and accepts the verse's word forms and their lemmas. A plain
Latin transliteration in running text that is not in the data is missed, so
the measure under-counts wrong forms rather than flagging English words.

## Alternatives considered

- **Keep model memory** (today): no cost, but word claims cannot be checked.
- **Map the selected Chinese word to one Greek/Hebrew word** (alignment):
  和合本 has no word alignment; approximate matching of 世人 → κόσμος would be
  a guess of our own. Instead the model sees the verse's words and is told
  to say so when the selected term matches none of them.
- **Full lexicons (TFLSJ, full BDB)**: tens of MB, mostly classical usage;
  the brief lexicons carry the sense a small group needs.
- **Send all passage verses' words**: 10–20× the request size for every
  question, including general ones; the control would no longer be today's
  request for those.

## Consequences

- Word questions name a real word, transliteration and Strong's number from
  the verse; a selection that matches no Greek/Hebrew word is said to.
- +21 MB static files (1,191) in the repo and the site; per question one
  chapter file, per session one lexicon.
- One more rule sentence and up to ~5–6k characters per word question.
- New third-party material with an attribution duty (NOTICE, README, panel credit).
- Out of scope: the personal app, pack generation, morphology of non-verbs,
  word-level alignment to 和合本.

## Release

1. Build script + generated `public/bible-data/orig/` + NOTICE/README credit (done).
2. `originalWords.ts` + block + rule behind the switch, off; lexical checker;
   evaluation script and fixture (done). `_shared/aiPrompts.ts` changed: with
   the switch off no request carries the block, so the proxy's behaviour is
   unchanged, but **`ai-proxy` must be deployed with this builder before the
   site switch is turned on** (ADR-0014 order).
3. Run the evaluation; record the result here.
4. If it meets the bar: deploy `ai-proxy`, then set the switch on and deploy
   the site. Status → accepted.
