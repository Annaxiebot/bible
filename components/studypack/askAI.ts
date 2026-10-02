/**
 * askAI.ts — Ask-AI prompt building + config for TV presentation mode · 问AI适配层
 *
 * The provider is OpenRouter (same endpoint/key as services/openrouter.ts);
 * the streaming transport lives in askAIStream.ts. Swapping providers later
 * means changing only these two files.
 */
import { getApiKey } from '../../services/openrouter';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { DEFAULT_AI_SETUP, wireModelId } from '../../services/aiDefaults';
import { StudyPack, Slide } from './packTypes';
import { ASK_AI_ANSWER_CONTRACT, TRANSLATIONS } from './principles';

/**
 * The OpenRouter model the overlay sends: the model chosen in AI settings
 * when the stored provider is OpenRouter (same keys AIProviderSettings and
 * aiDefaults use), otherwise the free-models router. A new visitor who only
 * pasted a key therefore gets free models (ADR goal: one paste, it works).
 */
export function resolveAskAIModel(): string {
  const provider = localStorage.getItem(STORAGE_KEYS.AI_PROVIDER);
  const model = localStorage.getItem(STORAGE_KEYS.AI_MODEL);
  const chosen = provider === DEFAULT_AI_SETUP.provider && model ? model : DEFAULT_AI_SETUP.model;
  return wireModelId(chosen);
}

/**
 * Token cap for overlay answers. The contract is ≤2 short sentences
 * (~60 words); 300 tokens leaves headroom for CJK tokenization.
 */
export const ASK_AI_MAX_TOKENS = 300;

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
      lines.push(`${v.num} ${v.cuv}\n${v.num} ${v.en}`);
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
    `FULL PASSAGE (${TRANSLATIONS.zh.label} / ${pack.enVersion}):\n${formatPassage(pack)}`,
    `CURRENT SLIDE:\n${formatSlide(slide)}`,
    ASK_AI_ANSWER_CONTRACT,
    `QUESTION: ${question}`,
  ].join('\n\n');
}

