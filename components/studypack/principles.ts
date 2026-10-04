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

/** Separator between the two halves of a bilingual body line ("中文 · English"). */
export const BILINGUAL_SEPARATOR = ' · ';

/** Bilingual body line as the packs write it: "中文 · English" (ADR-0003 §1). */
export function bilingualLine(zh: string, en: string): string {
  return `${zh}${BILINGUAL_SEPARATOR}${en}`;
}

/**
 * How much English a pack's generated lines carry (ADR-0003 §1 note). The
 * fixed headings, the verses (和合本 + BSB) and the app-owned lines stay
 * bilingual in every mode; only the model-drafted lines change.
 */
export type ContentLanguage = 'zh-keywords' | 'bilingual' | 'en-keywords';

/** The three modes in UI order (Chinese first). */
export const CONTENT_LANGUAGES: readonly ContentLanguage[] = ['zh-keywords', 'bilingual', 'en-keywords'];

/** What a new pack gets unless the leader picks otherwise. */
export const DEFAULT_CONTENT_LANGUAGE: ContentLanguage = 'zh-keywords';

/** Packs written before the field existed: their lines are "中文 · English", so they render unchanged. */
export const LEGACY_CONTENT_LANGUAGE: ContentLanguage = 'bilingual';

export function isContentLanguage(value: unknown): value is ContentLanguage {
  return CONTENT_LANGUAGES.includes(value as ContentLanguage);
}

/** One pack line from the model's halves: the mode decides which half (or both) is shown. */
export function contentLine(mode: ContentLanguage, zh: string, en: string): string {
  if (mode === 'zh-keywords') return zh;
  if (mode === 'en-keywords') return en;
  return bilingualLine(zh, en);
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
/**
 * Pack-generation content contract (ADR-0003 §1, §7, §12, §13, §17): what
 * the app's own AI engine must respect when it drafts a study pack. Injected
 * verbatim into every generation prompt by buildPackPrompt. Scripture text is
 * never requested from the model — it comes from the bundled Bible data (§4).
 */
export const PACK_CONTENT_CONTRACT = [
  'CONTENT RULES: Chinese is 简体 Simplified; where both languages appear,',
  'Chinese is shown first, English second (the CONTENT LANGUAGE rules below',
  'say which halves each line carries). Ground every point',
  'in the passage given below and cite verses as v.N or vv.N–M. Keep three',
  'kinds of claims separate: what Scripture says, what behavior it may lead',
  'to, and any scientific/health claim (never present the last two as biblical',
  'claims). Life-menu practices are concrete, doable within one week, and tied',
  'to this passage; use exactly the seven life areas given, in that order.',
  'Reflection prompts are private by default. Do not invent scripture text',
  'and do not quote verses at length — the app embeds the passage itself.',
].join('\n');

/**
 * Per-mode format contracts for the model-drafted lines (ADR-0003 §1 note).
 * `lineRule` goes into every generation prompt, `totalTarget` scales the
 * whole-reply size to the mode, `askAIRule` tells the TV overlay which
 * language a pack of that mode is answered in. Title and keyPhrase carry
 * both halves in every mode (they sit in fixed bilingual headings).
 */
export interface ContentLanguageContract {
  lineRule: string;
  totalTarget: string;
  askAIRule: string;
}

const KEYWORD_EXAMPLE_ZH = '忧虑（anxiety）';
const KEYWORD_EXAMPLE_EN = 'anxiety (忧虑)';

export const CONTENT_LANGUAGE_CONTRACTS: Record<ContentLanguage, ContentLanguageContract> = {
  'zh-keywords': {
    lineRule: [
      'CONTENT LANGUAGE: Chinese with English keywords. Every line is Simplified',
      'Chinese in the "zh" field; the first time a key theological or biblical term',
      `appears, follow it once with the English term in parentheses, e.g. ${KEYWORD_EXAMPLE_ZH}.`,
      'Do NOT translate sentences into English and do NOT add an "en" field — the only',
      'exceptions are title and keyPhrase, which carry both "zh" and "en".',
    ].join('\n'),
    totalTarget: '总量 Total: 整个 JSON 不超过约 1,600 个中文字，宁短勿长 · Keep the whole reply under ~1,600 Chinese characters; shorter is better.',
    askAIRule: 'CONTENT LANGUAGE: this pack is Chinese with English keywords — by default answer in Simplified Chinese ' +
      `with each key term once in English in parentheses, e.g. ${KEYWORD_EXAMPLE_ZH}, whatever language the question is in.`,
  },
  bilingual: {
    lineRule: [
      'CONTENT LANGUAGE: bilingual. Every item has a Chinese half ("zh", Simplified) and an',
      'English half ("en") saying the same thing; the app shows them as "中文 · English".',
    ].join('\n'),
    totalTarget: '总量 Total: 整个 JSON 不超过约 2,500 个中文字（含英文），宁短勿长 · Keep the whole reply under ~2,500 Chinese characters including the English; shorter is better.',
    askAIRule: 'CONTENT LANGUAGE: this pack is bilingual (中文 · English) — answer in the language of the question.',
  },
  'en-keywords': {
    lineRule: [
      'CONTENT LANGUAGE: English with Chinese keywords. Every line is English in the',
      '"en" field; the first time a key theological or biblical term appears, follow it',
      `once with the Simplified Chinese term in parentheses, e.g. ${KEYWORD_EXAMPLE_EN}.`,
      'Do NOT translate sentences into Chinese and do NOT add a "zh" field — the only',
      'exceptions are title and keyPhrase, which carry both "zh" and "en".',
    ].join('\n'),
    totalTarget: 'Total: keep the whole reply under ~900 English words; shorter is better.',
    askAIRule: 'CONTENT LANGUAGE: this pack is English with Chinese keywords — by default answer in English ' +
      `with each key term once in Simplified Chinese in parentheses, e.g. ${KEYWORD_EXAMPLE_EN}, whatever language the question is in.`,
  },
};

/**
 * Last-week sharing contract (ADR-0003 §1, §13, §17; ADR-0008): what the AI
 * may do with the answers members chose to share with their leader. Injected
 * verbatim into every sharing prompt by buildSharingPrompt.
 */
export const SHARING_CONTENT_CONTRACT = [
  'SHARING RULES: Chinese is 简体 Simplified; where both languages appear,',
  'Chinese is shown first, English second. Report only what the members said',
  'in the answers given below — do not add theological claims, Bible verses,',
  'interpretations, advice or health/scientific claims of your own, and never',
  'present what a member did as a biblical claim. Keep three kinds of claims',
  'separate: what Scripture says, what behavior it may lead to, and any',
  'scientific/health claim. Quotes are short anonymised paraphrases, never',
  'verbatim: no names, places, workplaces, family details or other identifiers.',
  'If the answers are few, say less; never invent experiences.',
].join('\n');

export const ASK_AI_ANSWER_CONTRACT = [
  'ANSWER RULES (override any other format rules):',
  '1. SHORT: at most 4 short sentences (~120 words / ~200 Chinese characters) —',
  'it is shown on a TV and must fit the screen.',
  '2. PASSAGE FIRST, THEN THE WHOLE BIBLE: start with what THIS passage says,',
  'citing the verse (e.g. v.7). When the question reaches beyond the passage',
  '(a doctrine, Christian maturity, how it connects to Jesus), add what the whole',
  'Bible says, introduced with "从整本圣经来看 · Across the whole Bible", with 1–2',
  'references written as Book C:V (e.g. Colossians 1:9–10). Never stop at',
  '"the passage does not mention this": say what the passage does say, then',
  'connect it, or distinguish ("related but not the same").',
  '3. A WORD OR PHRASE: give its historical and cultural background, the',
  'original-language sense (Hebrew/Greek, transliterated), and its meaning here.',
  '4. KEEP CLAIMS APART: what the text says, a theological synthesis, and an',
  'application are different kinds of claim; where Christians read a text',
  'differently, say "一种理解 · one reading" rather than stating it as fact.',
  '5. LANGUAGE: answer in the language of the question: a Chinese question gets',
  'a Chinese answer with key terms also in English; an English question gets an',
  'English answer. Follow-ups may go deeper, still within 4 short sentences.',
  'Do NOT use the [SPLIT] marker or a two-section format.',
].join('\n');
