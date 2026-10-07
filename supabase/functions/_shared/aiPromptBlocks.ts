/**
 * aiPromptBlocks.ts — the Ask-AI data blocks and their rules · 问答数据块 (ADR-0015, ADR-0018)
 *
 * Split out of aiPrompts.ts (R4, its 300-line budget): the RELATED VERSES and
 * ORIGINAL WORDS blocks the TV writes into the Ask-AI user message, the one
 * rule sentence each adds to the answer contract, and their detectors.
 * Pure leaf (no imports); aiPrompts.ts re-exports every name, so callers
 * keep importing from there (one definition, R3).
 */

/** One chat message as the builders see it (role + text). */
export interface PromptMessage { role: string; content: string }

/**
 * First line of the RELATED VERSES block in the Ask-AI user message (ADR-0015
 * §4) — data only: verses the TV found in the OpenBible.info cross-references.
 * One constant for the block's writer and its detector (R3).
 */
export const RELATED_VERSES_HEADING = 'RELATED VERSES';

/**
 * The one sentence the answer contract gains when — and only when — the
 * request carries a RELATED VERSES block (ADR-0015 §4). A request without the
 * block gets today's system message byte for byte (the evaluation's control, R14).
 */
export const ASK_AI_RELATED_VERSES_RULE =
  '7. RELATED VERSES: under "从整本圣经来看 · Across the whole Bible", cite only the study passage or the ' +
  'RELATED VERSES given with the question; if none of them fits the question, say so plainly rather than ' +
  'reaching for another verse.';

/** One related verse group for the block: a bilingual label and its verses (和合本 + English). */
export interface RelatedVerseText {
  label: string;
  verses: ReadonlyArray<{ num: number; cuv: string; en: string }>;
}

/**
 * The RELATED VERSES block for the user message, or '' when there is none
 * (no block → no rule sentence → today's request). `versions` names the two
 * translations, e.g. "和合本 / BSB".
 */
export function formatRelatedVersesBlock(entries: readonly RelatedVerseText[], versions: string): string {
  if (entries.length === 0) return '';
  const lines = [`${RELATED_VERSES_HEADING} (cross-references from OpenBible.info, ranked by readers' votes; ${versions}):`];
  for (const entry of entries) {
    lines.push(`[${entry.label}]`);
    for (const v of entry.verses) lines.push(`${v.num} ${v.cuv}\n${v.num} ${v.en}`);
  }
  return lines.join('\n');
}


const RELATED_BLOCK_START = new RegExp(`(^|\\n)${RELATED_VERSES_HEADING} \\(`);

function lastUserCarries(messages: readonly PromptMessage[], start: RegExp): boolean {
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  return !!lastUser && start.test(lastUser.content);
}

/** True when the latest user message carries a RELATED VERSES block (earlier turns hold only the questions). */
export function hasRelatedVersesBlock(messages: readonly PromptMessage[]): boolean {
  return lastUserCarries(messages, RELATED_BLOCK_START);
}

/**
 * First line of the ORIGINAL WORDS block (ADR-0018) — data only: the
 * selected or named verse's Greek/Hebrew words (STEP Bible, CC BY). One
 * constant for the block's writer and its detector (R3).
 */
/** The word data's source, named as STEP Bible asks (CC BY 4.0); the Ask AI credit line reuses it (tvHints). */
export const STEP_BIBLE_NAME = 'STEP Bible';

export const ORIGINAL_WORDS_HEADING = 'ORIGINAL WORDS';

/**
 * The rule the answer contract gains when — and only when — the request
 * carries an ORIGINAL WORDS block (ADR-0018); numbered after rule 7 when that is present.
 */
export const ASK_AI_ORIGINAL_WORDS_RULE =
  "ORIGINAL WORDS: When you explain a word's original-language sense, use only the ORIGINAL WORDS for that verse: " +
  "name the word, its transliteration and Strong's number as given; if the selected Chinese or English term matches " +
  'none of them, say so rather than guessing.';

/** One word of a verse; `lemma`/`lemmaTranslit`/`brief` come from the brief lexicon (absent if it failed to load). */
export interface OriginalWord {
  original: string;
  translit: string;
  strong: string;
  /** Verbs only (tense, mood, stem); '' for other words. */
  morph: string;
  gloss: string;
  lemma?: string;
  lemmaTranslit?: string;
  brief?: string;
}

/** One verse's words for the block: a bilingual label, the language, the words in text order. */
export interface OriginalWordsVerse {
  label: string;
  language: 'Greek' | 'Hebrew';
  words: readonly OriginalWord[];
}

/**
 * The ORIGINAL WORDS block for the user message, or '' when there is none
 * (no block → no rule → today's request). One line per word:
 * "translit (original) · Strong's · morph · gloss — lemma (translit): brief meaning";
 * the lexicon part is printed once per Strong's number in the block.
 */
export function formatOriginalWordsBlock(verses: readonly OriginalWordsVerse[]): string {
  if (verses.length === 0) return '';
  const lines = [`${ORIGINAL_WORDS_HEADING} (${STEP_BIBLE_NAME} tagged Greek/Hebrew text and brief lexicon, per verse in text order; ` +
    "transliteration (original) · Strong's · morphology (verbs) · English gloss — dictionary form: brief meaning):"];
  const explained = new Set<string>();
  for (const verse of verses) {
    lines.push(`[${verse.label} · ${verse.language}]`);
    for (const w of verse.words) {
      const head = [`${w.translit} (${w.original})`, w.strong, ...(w.morph ? [w.morph] : []), w.gloss].join(' · ');
      const lexicon = w.brief && !explained.has(w.strong) ? ` — ${w.lemma} (${w.lemmaTranslit}): ${w.brief}` : '';
      explained.add(w.strong);
      lines.push(head + lexicon);
    }
  }
  return lines.join('\n');
}

const ORIGINAL_BLOCK_START = new RegExp(`(^|\\n)${ORIGINAL_WORDS_HEADING} \\(`);

/** True when the latest user message carries an ORIGINAL WORDS block. */
export function hasOriginalWordsBlock(messages: readonly PromptMessage[]): boolean {
  return lastUserCarries(messages, ORIGINAL_BLOCK_START);
}
