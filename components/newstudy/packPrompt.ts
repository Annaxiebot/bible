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
import { PACK_CONTENT_CONTRACT, LIFE_AREAS, TRANSLATIONS } from '../studypack/principles';

/** Enough for a full bilingual pack (CJK tokenizes ~1 token/char); truncation is detected and surfaced. */
export const PACK_MAX_TOKENS = 4000;
/** Low temperature: structure and fidelity over flair. */
export const PACK_TEMPERATURE = 0.3;

export const PACK_SYSTEM_PROMPT =
  'You draft small-group Bible study material for a Chinese-speaking congregation. ' +
  'Reply with exactly one JSON object and nothing else: no prose, no markdown fences.';

export interface PromptInput {
  /** e.g. "约翰福音 3:22–36 · John 3:22–36" */
  passageRef: string;
  verses: PackVerse[];
  /** Optional lesson title the leader typed (the model keeps it). */
  lessonTitle?: string;
}

/** The JSON shape the model must return. Kept as a literal template so the prompt and the validator agree. */
export const GENERATED_SHAPE = [
  '{',
  '  "title": {"zh": "短标题", "en": "Short title"},',
  '  "keyPhrase": {"zh": "「经文中的一句话」", "en": "“a phrase from the passage”", "verse": 23},',
  '  "context": [{"zh": "…", "en": "…"}, {"zh": "…", "en": "…"}, {"zh": "…", "en": "…"}],',
  '  "originalLanguage": [{"zh": "…", "en": "…"}, {"zh": "…", "en": "…"}],',
  '  "crossRefs": [{"ref": "Luke 12:22-31", "zh": "一句话说明关联", "en": "one-line reason"}],',
  '  "discussion": [{"zh": "…", "en": "…"}],',
  '  "lifeMenu": [{"area": "健康 Health", "zh": "具体操练", "en": "concrete practice"}],',
  '  "reflection": {"tue": {"zh": "…", "en": "…"}, "thu": {"zh": "…", "en": "…"}, "weekend": {"zh": "…", "en": "…"}},',
  '  "closing": {"zh": "下周五的开场问题", "en": "the question next Friday opens with"}',
  '}',
].join('\n');

function formatPassage(verses: PackVerse[]): string {
  return verses.map(v => `${v.num} ${v.cuv}\n${v.num} ${v.en}`).join('\n');
}

/** The user-turn prompt: passage, content contract, exact JSON shape and counts. */
export function buildPackPrompt(input: PromptInput): string {
  const titleLine = input.lessonTitle
    ? `The leader's lesson title is "${input.lessonTitle}" — keep it as the title (translate the missing half).`
    : 'Give the pack a short bilingual title taken from the passage\'s main theme.';
  return [
    `Draft a Friday small-group study pack for ${input.passageRef}.`,
    `FULL PASSAGE (${TRANSLATIONS.zh.label} / ${TRANSLATIONS.en.label}):\n${formatPassage(input.verses)}`,
    PACK_CONTENT_CONTRACT,
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
    `Return STRICT JSON with exactly this shape (no extra keys, no comments):\n${GENERATED_SHAPE}`,
  ].join('\n\n');
}
