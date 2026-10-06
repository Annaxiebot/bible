/**
 * adjustPrompt.ts — the prompt that revises ONE pack section · 单段修改提示词
 *
 * The leader types an instruction ("更简单 · Simpler"); the model returns the
 * same JSON shape for that one section. Rules are imported, never pasted
 * (R3): the compact-JSON rule from packPrompt (the system prompt is
 * server-owned, ADR-0014 — role 'adjust' gets the pack's), the content
 * contract and the pack's content-language line rule from principles. The
 * heading is never sent (headings stay fixed) and scripture is never
 * adjustable — verses come from the bundled Bible (ADR-0003 §4). The life
 * menu keeps its seven areas in order; only the practices change.
 */
import { PackSection, SectionKind, StudyPack } from '../studypack/packTypes';
import { PACK_CONTENT_CONTRACT, CONTENT_LANGUAGE_CONTRACTS, ContentLanguage } from '../studypack/principles';
import { packGenerationModel } from '../../services/aiDefaults';
import { PACK_COMPACT_JSON_RULE, PACK_TEMPERATURE } from './packPrompt';

/** Sections whose lines the model drafted; title (app-owned facts), scripture (bundled) and qr (fixed) are excluded. */
export const ADJUSTABLE_KINDS: readonly SectionKind[] = [
  'context', 'originalLanguage', 'crossRefs', 'discussion', 'lifeMenu', 'reflection', 'closing',
];

export function isAdjustable(kind: SectionKind): boolean {
  return ADJUSTABLE_KINDS.includes(kind);
}

/** Discussion bounds the validator enforces (the prompt states them too). */
export const ADJUST_MIN_QUESTIONS = 1;
export const ADJUST_MAX_QUESTIONS = 8;
/** Upper bound on body lines for one section; a generated section has 1–5. */
export const ADJUST_MAX_BODY_LINES = 12;
/** One section is far smaller than a pack; the hosted proxy clamps the role at 4000 anyway. */
export const ADJUST_MAX_TOKENS = 2000;

/** What the prompt needs from the pack (passed down to SectionEditor). */
export type AdjustPack = Pick<StudyPack, 'passageRef' | 'contentLanguage'>;

export interface AdjustInput {
  passageRef: string;
  contentLanguage: ContentLanguage;
  section: PackSection;
  instruction: string;
}

/** The section's adjustable content — exactly the JSON the model sees and must return (no heading). */
export function adjustContent(section: PackSection): Partial<PackSection> {
  if (section.kind === 'discussion') return { questions: section.questions ?? [] };
  if (section.kind === 'lifeMenu') return { rows: section.rows ?? [] };
  return { body: section.body ?? [] };
}

function kindRule(section: PackSection): string {
  if (section.kind === 'discussion') {
    const n = section.questions?.length ?? 0;
    return [
      `Return {"questions": [...]}. Keep ${n} question${n === 1 ? '' : 's'} unless the instruction asks for more`,
      `or fewer; never fewer than ${ADJUST_MIN_QUESTIONS} or more than ${ADJUST_MAX_QUESTIONS}. No empty questions.`,
    ].join('\n');
  }
  if (section.kind === 'lifeMenu') {
    const areas = (section.rows ?? []).map(r => r.area);
    return [
      'Return {"rows": [{"area": "…", "practice": "…"}, …]} with exactly these areas, in this order,',
      `each "area" string copied exactly: ${areas.join('; ')}. Change only the "practice" texts.`,
    ].join('\n');
  }
  return [
    `Return {"body": [...]} — 1 to ${ADJUST_MAX_BODY_LINES} non-empty lines. Keep each line's existing`,
    'format (e.g. a Bible reference at the start of a cross-reference line stays in English "Book C:V").',
  ].join('\n');
}

/** The user turn: passage, contracts, the section kind + its current JSON, the leader's instruction, the shape. */
export function buildAdjustPrompt(input: AdjustInput): string {
  const current = JSON.stringify(adjustContent(input.section));
  return [
    `Revise ONE section ("${input.section.kind}") of a Friday small-group study pack for ${input.passageRef}.`,
    PACK_CONTENT_CONTRACT,
    CONTENT_LANGUAGE_CONTRACTS[input.contentLanguage].lineRule,
    [
      'The lines below are finished display strings, not {"zh","en"} objects: apply the CONTENT',
      'LANGUAGE rule to the text inside each string. The section heading is fixed and not part of',
      'your reply. Never quote or rewrite Bible verses — the app embeds the passage itself.',
    ].join('\n'),
    `CURRENT CONTENT (${input.section.kind}):\n${current}`,
    `LEADER'S INSTRUCTION: ${input.instruction.trim()}`,
    kindRule(input.section),
    PACK_COMPACT_JSON_RULE,
    'Return ONLY the same JSON shape as CURRENT CONTENT — no other keys, no commentary.',
  ].join('\n\n');
}

/** The chat/completions body in the data form (streamed through the shared transport, role 'adjust'; no system message, ADR-0014). */
export function buildAdjustRequestBody(input: AdjustInput): string {
  return JSON.stringify({
    model: packGenerationModel(), // own key: the leader's pack model; hosted: the server picks per role (ADR-0007)
    stream: true,
    max_tokens: ADJUST_MAX_TOKENS,
    temperature: PACK_TEMPERATURE,
    messages: [
      { role: 'user', content: buildAdjustPrompt(input) },
    ],
  });
}
