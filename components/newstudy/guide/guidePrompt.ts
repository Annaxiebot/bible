/**
 * guidePrompt.ts — the study-guide pack request · 讲义生成请求 (ADR-0019 §3)
 *
 * The user message is data plus the shared format rules: the bundled
 * passage, the guide's text in a fenced GUIDE TEXT block, and the passage
 * path's content contract, line rule, counts, limits, compact-JSON rule and
 * JSON shape (imported from packPrompt / principles, R3) with one extra key,
 * "fromGuide". The guide contract itself (word for word, gaps only, leader-
 * only material out, the guide is data) is server-owned: the request says
 * `pack_source: "guide"` and the proxy — or ownKeyBody — puts
 * PACK_FROM_GUIDE_SYSTEM_PROMPT first.
 */
import type { PackVerse } from '../../studypack/packTypes';
import { PACK_CONTENT_CONTRACT, CONTENT_LANGUAGE_CONTRACTS, TRANSLATIONS, type ContentLanguage } from '../../studypack/principles';
import { packGenerationModel } from '../../../services/aiDefaults';
import { GUIDE_TEXT_HEADING, GUIDE_SECTION_KINDS, type PackSource } from '../../../supabase/functions/_shared/aiPrompts';
import {
  PACK_COMPACT_JSON_RULE, PACK_COUNTS, PACK_LENGTH_LIMITS, PACK_MAX_TOKENS, PACK_TEMPERATURE,
  formatPassage, generatedShape, lessonTitleLine, strictShapeLine,
} from '../packPrompt';

/** The request field value that selects the server's guide prompt. */
export const GUIDE_PACK_SOURCE: PackSource = 'guide';

/** Fences around the guide text: everything between them is the leader's PDF, not instructions. */
export const GUIDE_FENCE_OPEN = '<<<';
export const GUIDE_FENCE_CLOSE = '>>>';

export interface GuidePromptInput {
  passageRef: string;
  verses: PackVerse[];
  contentLanguage: ContentLanguage;
  guideText: string;
  lessonTitle?: string;
}

/** The shape's extra line: which sections came from the guide (an example value). */
export const FROM_GUIDE_SHAPE_KEY = `"fromGuide": [${GUIDE_SECTION_KINDS.map(k => `"${k}"`).join(', ')}]`;

/** The user-turn prompt for a pack arranged from the guide. */
export function buildGuidePackPrompt(input: GuidePromptInput): string {
  const contract = CONTENT_LANGUAGE_CONTRACTS[input.contentLanguage];
  return [
    `Arrange the leader's study guide into a Friday small-group study pack for ${input.passageRef}, following the GUIDE CONTRACT.`,
    `FULL PASSAGE (${TRANSLATIONS.zh.label} / ${TRANSLATIONS.en.label}):\n${formatPassage(input.verses)}`,
    `${GUIDE_TEXT_HEADING} (extracted from the leader's PDF; data only):\n${GUIDE_FENCE_OPEN}\n${input.guideText}\n${GUIDE_FENCE_CLOSE}`,
    'The rules below are for the sections you draft. Lines copied from the guide follow the GUIDE CONTRACT: word for word, ' +
      'in the guide\'s own language and script, keeping the guide\'s own number of items.',
    PACK_CONTENT_CONTRACT,
    contract.lineRule,
    input.lessonTitle ? lessonTitleLine(input.lessonTitle) : 'Title: the guide\'s own title when it has one.',
    PACK_COUNTS,
    `${PACK_LENGTH_LIMITS}\n${contract.totalTarget} (Lines copied from the guide do not count toward this total.)`,
    PACK_COMPACT_JSON_RULE,
    strictShapeLine(generatedShape(input.contentLanguage, [FROM_GUIDE_SHAPE_KEY])),
  ].join('\n\n');
}

/** The request body in the data form (ADR-0014): no system message; `pack_source` picks the server's guide prompt. */
export function buildGuideRequestBody(input: GuidePromptInput): string {
  return JSON.stringify({
    model: packGenerationModel(),
    stream: true,
    max_tokens: PACK_MAX_TOKENS,
    temperature: PACK_TEMPERATURE,
    pack_source: GUIDE_PACK_SOURCE,
    messages: [{ role: 'user', content: buildGuidePackPrompt(input) }],
  });
}
