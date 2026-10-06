/**
 * packPrompt.ts — the one generation prompt for a study pack · 生成提示词
 *
 * The model drafts ONLY the interpretive layers (context, original language,
 * cross-references, discussion, life menu, reflection, closing) as one JSON
 * object; scripture text is embedded by the app from the bundled Bible data
 * (ADR-0003 §4) and is given to the model here as source material. Content
 * rules are imported from principles.ts — never pasted (R3).
 */
import { PackVerse } from '../studypack/packTypes';
import {
  PACK_CONTENT_CONTRACT, CONTENT_LANGUAGE_CONTRACTS, ContentLanguage, LIFE_AREAS, TRANSLATIONS,
} from '../studypack/principles';

/**
 * Output budget for one pack. CJK tokenizes at ~1+ token per character, so a
 * full bilingual pack is ~8–10k tokens; 4000 cut the owner's first real run
 * mid-JSON. Sonnet 4.5 allows this cap (worst case ≈ $0.18 per pack). A
 * finish_reason of "length" still gets one continuation turn (generatePack).
 */
export const PACK_MAX_TOKENS = 12000;
/** Low temperature: structure and fidelity over flair. */
export const PACK_TEMPERATURE = 0.3;

export const PACK_SYSTEM_PROMPT =
  'You draft small-group Bible study material for a Chinese-speaking congregation. ' +
  'Reply with exactly one JSON object and nothing else: no prose, no markdown fences.';

/** Compact output: every byte of indentation is a token that is not content. */
export const PACK_COMPACT_JSON_RULE = [
  'FORMAT: output COMPACT JSON on a single line — no indentation, no newlines',
  'inside the JSON, no markdown fences, no commentary before or after it.',
  'Inside JSON strings NEVER use the straight double quote (\"): quote Chinese',
  'with 「」 and English with “ ” (curly quotes).',
].join('\n');

/**
 * Per-field length limits; together with the counts and the mode's total
 * target (CONTENT_LANGUAGE_CONTRACTS) they keep a pack inside PACK_MAX_TOKENS.
 */
export const PACK_LENGTH_LIMITS = [
  'LENGTH LIMITS (per language half): context paragraphs ≤ 2 sentences each;',
  'originalLanguage notes ≤ 1 sentence each; crossRefs reasons ≤ 12 words;',
  'lifeMenu practices ≤ 25 words each; each reflection check-in 1 line;',
  'closing 1 line; title and keyPhrase a few words. Be concrete, not wordy.',
].join('\n');

/** The user turn that asks the model to finish a reply cut off by max_tokens (one attempt). */
export const PACK_CONTINUE_PROMPT =
  '继续输出未完成的 JSON，从中断处接着写，不要重复 · ' +
  'Continue the unfinished JSON exactly from where it stopped, no repetition';

export interface PromptInput {
  /** e.g. "约翰福音 3:22–36 · John 3:22–36" */
  passageRef: string;
  verses: PackVerse[];
  /** Optional lesson title the leader typed (the model keeps it). */
  lessonTitle?: string;
  /** Which halves each model-drafted line carries (CONTENT_LANGUAGE_CONTRACTS). */
  contentLanguage: ContentLanguage;
}

/**
 * The JSON shape the model must return for a mode: a bilingual item has both
 * halves, a keywords mode only its own half (title and keyPhrase always both).
 * Kept as a literal template so the prompt and the validator agree.
 */
export function generatedShape(mode: ContentLanguage): string {
  const item = (zh: string, en: string, extra = '') => {
    const halves = mode === 'zh-keywords' ? [`"zh": "${zh}"`]
      : mode === 'en-keywords' ? [`"en": "${en}"`]
      : [`"zh": "${zh}"`, `"en": "${en}"`];
    return `{${extra}${halves.join(', ')}}`;
  };
  const dots = item('…', '…');
  return [
    '{',
    '  "title": {"zh": "短标题", "en": "Short title"},',
    '  "keyPhrase": {"zh": "「经文中的一句话」", "en": "“a phrase from the passage”", "verse": 23},',
    `  "context": [${dots}, ${dots}, ${dots}],`,
    `  "originalLanguage": [${dots}, ${dots}],`,
    `  "crossRefs": [${item('一句话说明关联', 'one-line reason', '"ref": "Luke 12:22-31", ')}],`,
    `  "discussion": [${dots}],`,
    `  "lifeMenu": [${item('具体操练', 'concrete practice', '"area": "健康 Health", ')}],`,
    `  "reflection": {"tue": ${dots}, "thu": ${dots}, "weekend": ${dots}},`,
    `  "closing": ${item('下周五的开场问题', 'the question next Friday opens with')}`,
    '}',
  ].join('\n');
}

/** The bilingual shape (legacy packs' format; tests pin it). */
export const GENERATED_SHAPE = generatedShape('bilingual');

function formatPassage(verses: PackVerse[]): string {
  return verses.map(v => `${v.num} ${v.cuv}\n${v.num} ${v.en}`).join('\n');
}

/** The user-turn prompt: passage, content contract, the mode's line rule, exact JSON shape, counts and totals. */
export function buildPackPrompt(input: PromptInput): string {
  const contract = CONTENT_LANGUAGE_CONTRACTS[input.contentLanguage];
  const titleLine = input.lessonTitle
    ? `The leader's lesson title is "${input.lessonTitle}" — keep it as the title (translate the missing half).`
    : 'Give the pack a short bilingual title taken from the passage\'s main theme.';
  return [
    `Draft a Friday small-group study pack for ${input.passageRef}.`,
    `FULL PASSAGE (${TRANSLATIONS.zh.label} / ${TRANSLATIONS.en.label}):\n${formatPassage(input.verses)}`,
    PACK_CONTENT_CONTRACT,
    contract.lineRule,
    titleLine,
    [
      'COUNTS: context = 3 short paragraphs; originalLanguage = 2–3 notes on key',
      'Greek/Hebrew words (transliterated, with the meaning); crossRefs = 4–5 real',
      'Bible references written in English as "Book C:V" or "Book C:V-V" with a',
      'one-line reason each; discussion = 5 questions, concrete, moving from the',
      'text to the group\'s own week; lifeMenu = exactly these seven areas in this',
      `order, one practice each: ${LIFE_AREAS.join('; ')}; reflection = one`,
      'Tuesday check-in, one Thursday check-in, one weekend review; closing = the',
      'question next Friday opens with, asking what happened when the chosen',
      'practice met real life. keyPhrase = a short phrase quoted from the passage',
      'with its verse number.',
    ].join('\n'),
    `${PACK_LENGTH_LIMITS}\n${contract.totalTarget}`,
    PACK_COMPACT_JSON_RULE,
    `Return STRICT JSON with exactly this shape (no extra keys, no comments; the shape is indented here only for reading — your output is not):\n${generatedShape(input.contentLanguage)}`,
  ].join('\n\n');
}
