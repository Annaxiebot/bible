/**
 * askAI.ts — Ask-AI prompt building + config for TV presentation mode · 问AI适配层
 *
 * The provider is OpenRouter (same endpoint/key as services/openrouter.ts);
 * the streaming transport lives in askAIStream.ts. Swapping providers later
 * means changing only these two files.
 */
import { getApiKey } from '../../services/openrouter';
import { StudyPack, Slide } from './packTypes';

/** Default model, routed via OpenRouter. Change here to switch models. */
export const ASK_AI_MODEL = 'anthropic/claude-sonnet-4.5';

/**
 * Token cap for overlay answers. The contract is ≤2 short sentences
 * (~60 words); 300 tokens leaves headroom for CJK tokenization.
 */
export const ASK_AI_MAX_TOKENS = 300;

export const AI_NOT_CONFIGURED_MESSAGE =
  'AI not configured — set your OpenRouter API key in app Settings. ' +
  '未配置AI — 请在应用设置中填写 OpenRouter API 密钥。';

export interface AskAIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function isAskAIConfigured(): boolean {
  return !!getApiKey();
}

/**
 * The shared scholar system prompt mandates a [SPLIT] bilingual format; our
 * rules ask the model not to, but strip it defensively for TV display. Also
 * applied to the accumulating text while streaming.
 */
export function stripSplitMarker(text: string): string {
  return text.replace(/\s*\[SPLIT\]\s*/g, '\n').trim();
}

function formatSlide(slide: Slide): string {
  const parts: string[] = [slide.heading];
  if (slide.question) parts.push(`Question: ${slide.question}`);
  if (slide.body?.length) parts.push(...slide.body);
  if (slide.rows?.length) parts.push(...slide.rows.map(r => `${r.area}: ${r.practice}`));
  return parts.join('\n');
}

/** All scripture sections of the current pack (a pack may have several). */
function formatPassage(pack: StudyPack): string {
  const lines: string[] = [];
  for (const section of pack.sections) {
    if (section.kind !== 'scripture' || !section.verses) continue;
    lines.push(`[${section.heading}]`);
    for (const v of section.verses) {
      lines.push(`${v.num} ${v.cuv}\n${v.num} ${v.web}`);
    }
  }
  return lines.join('\n');
}

/** Auto-ask question for text the user selected on a slide. */
export function questionForSelection(selected: string): string {
  return `Explain this phrase in the context of the passage and cite the verse ` +
    `请结合经文解释并注明节数: "${selected}"`;
}

/**
 * Prompt for one overlay question. The passage (full bilingual text from the
 * pack), the current slide, and the answer contract are rebuilt every turn;
 * the conversation so far travels in the `history` parameter.
 */
export function buildAskAIPrompt(pack: StudyPack, slide: Slide, question: string): string {
  return [
    `We are in a small-group TV presentation of ${pack.passageRef}.`,
    `FULL PASSAGE (CUV 和合本 / WEB):\n${formatPassage(pack)}`,
    `CURRENT SLIDE:\n${formatSlide(slide)}`,
    'ANSWER RULES (override any other format rules): answer in at most 2 short',
    'sentences (max ~60 words total — this is shown on a TV and must fit the',
    'screen), grounded in this passage, citing the verse (e.g. v.27). Answer in',
    'the language of the question: a Chinese question gets a Chinese answer with',
    'key terms also in English; an English question gets an English answer.',
    'Follow-up questions may go deeper into chapter/book context and',
    'interpretations, still within 2 short sentences. Do NOT use the [SPLIT]',
    'marker or a two-section format.',
    `QUESTION: ${question}`,
  ].join('\n\n');
}

