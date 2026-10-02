/**
 * principles.ts — machine-readable content principles · 内容原则
 *
 * Typed constants encoding the machine-relevant parts of
 * docs/adr/0003-scripturetolife-content-principles.md (the canonical
 * statement). One source (R3): buildAskAIPrompt, TV-mode labels, packs'
 * integrity tests, and the future pack generator import from here, so the
 * ADR and the code cannot drift. If you change a rule, change the ADR too.
 */

/**
 * Bilingual order rule (ADR-0003 §1): 中文 first, English second.
 * Single exception: the "Scripture to Life" brand wordmark.
 */
export function bilingual(zh: string, en: string): string {
  return `${zh} ${en}`;
}

/** Translations the app displays and bundles (ADR-0003 §2–4). */
export const TRANSLATIONS = {
  zh: { id: 'cuv', label: '和合本' },  // Simplified 简体 for display
  en: { id: 'bsb', label: 'BSB' },     // Berean Standard Bible, public domain
} as const;

/** The seven stable life areas, Chinese first (ADR-0003 §12). */
export const LIFE_AREAS: readonly string[] = [
  bilingual('健康', 'Health'),
  bilingual('关系', 'Relationships'),
  bilingual('家庭', 'Family'),
  bilingual('工作', 'Work'),
  bilingual('情绪', 'Emotional'),
  bilingual('财务', 'Finance'),
  bilingual('属灵', 'Spiritual'),
];

/**
 * Minimum type sizes for TV mode (audience includes seniors): vh terms are
 * the 1080p-TV floor, px terms the phone floor (vh collapses on short
 * viewports). Counters/hints may stay smaller than these.
 */
export const TYPE_SCALE = {
  heading: 'max(20px, 7vh)',       // slide headings ≥ 7vh
  body: 'max(16px, 5vh)',          // body lines ≥ 5vh
  verse: 'max(16px, 3.6vh)',       // bilingual verse rows ≥ 3.6vh (~39px @1080p)
  lifeMenuRow: 'max(16px, 3.4vh)', // life-menu rows ≥ 3.2vh
  question: 'max(18px, 6vh)',      // discussion questions ≥ 5vh
  popup: 'max(16px, 3vh)',         // verse popup text ≥ 3vh
  answerShort: 'max(18px, 6vh)',   // Ask AI ≤120 chars
  answerMedium: 'max(16px, 5vh)',  // Ask AI ≤240 chars
  answerLong: 'max(16px, 4vh)',    // Ask AI longer (scrolls)
} as const;

/**
 * Ask AI first-answer contract (ADR-0003 §9): at most 2 short sentences
 * (~60 words), cite the verse, answer in the question's language (Chinese
 * question → Chinese answer with key English terms). Injected verbatim into
 * every Ask-AI prompt by buildAskAIPrompt.
 */
export const ASK_AI_ANSWER_CONTRACT = [
  'ANSWER RULES (override any other format rules): answer in at most 2 short',
  'sentences (max ~60 words total — this is shown on a TV and must fit the',
  'screen), grounded in this passage, citing the verse (e.g. v.27). Answer in',
  'the language of the question: a Chinese question gets a Chinese answer with',
  'key terms also in English; an English question gets an English answer.',
  'Follow-up questions may go deeper into chapter/book context and',
  'interpretations, still within 2 short sentences. Do NOT use the [SPLIT]',
  'marker or a two-section format.',
].join('\n');
