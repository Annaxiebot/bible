/**
 * adjustStrings.ts — strings of the per-section "AI 修改 Adjust with AI" box · 文案
 *
 * Single source (R3): SectionAdjust renders these, unit + e2e tests import
 * them. Chinese first (ADR-0003 §1). Pure module (no React) so Playwright
 * specs can import it. Failure lines are NOT here: transport failures reuse
 * askAIErrors/tvHints, an unusable reply reuses NS_ERR_INVALID.
 */
import { bilingualLine } from '../studypack/principles';

export const AJ_OPEN = bilingualLine('AI 修改', 'Adjust with AI');
export const AJ_FIELD = bilingualLine('告诉 AI 怎样改这一段', 'Tell the AI how to change this section');
export const AJ_SEND = bilingualLine('发送', 'Send');
export const AJ_BUSY = bilingualLine('AI 修改中…', 'Adjusting…');
export const AJ_UNDO = bilingualLine('撤销', 'Undo');

/** Quick instructions: a chip fills the field with its own text (the model reads both halves). */
export const AJ_CHIPS: readonly string[] = [
  bilingualLine('更简单', 'Simpler'),
  bilingualLine('更短', 'Shorter'),
  bilingualLine('更贴近生活', 'More practical'),
];
