/**
 * askAI.ts — Ask-AI prompt building + config for TV presentation mode · 问AI适配层
 *
 * The provider is OpenRouter (own key, or the site's ai-proxy — services/
 * aiTransport); the streaming transport lives in askAIStream.ts. Swapping providers later
 * means changing only these two files.
 */
import { askAIModel, wireModelId } from '../../services/aiDefaults';
import { StudyPack, Slide, packContentLanguage } from './packTypes';
import { ASK_AI_ANSWER_CONTRACT, CONTENT_LANGUAGE_CONTRACTS, TRANSLATIONS } from './principles';

/** The OpenRouter wire id the overlay sends: the configurable Ask-AI choice (services/aiDefaults askAIModel) mapped from any router alias. */
export function resolveAskAIModel(): string {
  return wireModelId(askAIModel());
}

/**
 * Token cap for overlay answers. The contract is ≤2 short sentences
 * (~60 words); 300 tokens leaves headroom for CJK tokenization.
 */
/** ~4 short sentences incl. background + cross-references; CJK is ~1 token per character (ADR-0003 §9). */
export const ASK_AI_MAX_TOKENS = 700;

export interface AskAIMessage {
  role: 'user' | 'assistant';
  content: string;
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

/**
 * Auto-ask question for text the user selected on a slide: what the word or
 * phrase means right here — historical and cultural background first, then
 * the original-language sense (owner, 2026-10-04). With the verse it was selected in, the question
 * names that verse; otherwise the passage. Chinese first (ADR-0003 §1).
 */
export function questionForSelection(selected: string, verse: number | null = null): string {
  const where = verse === null
    ? { zh: '在这段经文中', en: 'in this passage' }
    : { zh: `在第${verse}节中`, en: `in verse ${verse}` };
  return `「${selected}」${where.zh}是什么意思？请说明当时的历史和文化背景、原文（希腊文/希伯来文）的意思，以及它在这里的含义，并注明节数 · ` +
    `What does "${selected}" mean ${where.en}? Explain the historical and cultural background of the time, the original-language sense, and its meaning here, and cite the verse`;
}

/**
 * Prompt for one overlay question. The passage (full bilingual text from the
 * pack), the current slide, the answer contract and the pack's content-
 * language rule (a zh-keywords pack is answered in Chinese with English
 * keywords by default) are rebuilt every turn; the conversation so far
 * travels in the `history` parameter.
 */
export function buildAskAIPrompt(pack: StudyPack, slide: Slide, question: string): string {
  return [
    `We are in a small-group TV presentation of ${pack.passageRef}.`,
    `FULL PASSAGE (${TRANSLATIONS.zh.label} / ${pack.enVersion}):\n${formatPassage(pack)}`,
    `CURRENT SLIDE:\n${formatSlide(slide)}`,
    ASK_AI_ANSWER_CONTRACT,
    CONTENT_LANGUAGE_CONTRACTS[packContentLanguage(pack)].askAIRule,
    `QUESTION: ${question}`,
  ].join('\n\n');
}

