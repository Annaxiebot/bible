/**
 * adjustSection.ts — one section + instruction → model → validated section · 单段修改
 *
 * Streams one completion through the shared transport
 * (askAIStream.streamChatCompletionDetailed, role 'adjust'), so transport
 * failures arrive as the typed AskAIError lines Ask AI already shows
 * (sign-in-needed, quota, credit used up, …). The reply is parsed tolerant
 * of a fenced block (extractJsonObject) and validated per kind; an
 * unusable reply gets ONE retry, a second is an AdjustError carrying
 * NS_ERR_INVALID. The returned section keeps kind and heading (and every
 * other field) — only body / questions / rows change.
 */
import { PackSection, LifeMenuRow } from '../studypack/packTypes';
import { streamChatCompletionDetailed, AIRequestMeta } from '../studypack/askAIStream';
import { emptyError } from '../studypack/askAIErrors';
import { extractJsonObject } from './generatedPack';
import { NS_ERR_INVALID, NS_ERR_LIFE_AREAS } from './newStudyStrings';
import {
  AdjustInput, buildAdjustRequestBody, ADJUST_MIN_QUESTIONS, ADJUST_MAX_QUESTIONS, ADJUST_MAX_BODY_LINES,
} from './adjustPrompt';

/** Quota role on the hosted proxy + X-Title header for an own key (ASCII only). */
const ADJUST_REQUEST: AIRequestMeta = { role: 'adjust', title: 'Scripture to Life - Adjust section' };

/** The model's reply could not be used (bad JSON, wrong shape, life areas changed). `message` is bilingual. */
export class AdjustError extends Error {
  readonly kind = 'invalid-reply' as const;
  constructor(message: string, detail?: string) {
    super(detail ? `${message}: ${detail}` : message);
    this.name = 'AdjustError';
  }
}

function cleanLines(value: unknown, field: string, min: number, max: number): string[] {
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) throw new AdjustError(NS_ERR_INVALID, field);
  const lines = value.map(v => v.trim());
  if (lines.some(l => l.length === 0) || lines.length < min || lines.length > max) {
    throw new AdjustError(NS_ERR_INVALID, `${field} ${min}–${max}`);
  }
  return lines;
}

/** Same areas, same order, as the section had; the area labels are kept from the section, not the model. */
function cleanRows(value: unknown, current: LifeMenuRow[]): LifeMenuRow[] {
  if (!Array.isArray(value) || value.length !== current.length) throw new AdjustError(NS_ERR_LIFE_AREAS);
  return current.map((row, i) => {
    const raw = value[i] as Partial<LifeMenuRow> | null;
    if (typeof raw?.area !== 'string' || raw.area.trim() !== row.area.trim()) throw new AdjustError(NS_ERR_LIFE_AREAS);
    const practice = typeof raw.practice === 'string' ? raw.practice.trim() : '';
    if (!practice) throw new AdjustError(NS_ERR_INVALID, row.area);
    return { area: row.area, practice };
  });
}

/** The reply's JSON → the patch for this section's kind. Throws AdjustError. */
export function validateAdjusted(section: PackSection, reply: Record<string, unknown>): Partial<PackSection> {
  if (section.kind === 'discussion') {
    return { questions: cleanLines(reply.questions, 'questions', ADJUST_MIN_QUESTIONS, ADJUST_MAX_QUESTIONS) };
  }
  if (section.kind === 'lifeMenu') return { rows: cleanRows(reply.rows, section.rows ?? []) };
  return { body: cleanLines(reply.body, 'body', 1, ADJUST_MAX_BODY_LINES) };
}

function parseReply(section: PackSection, text: string): Partial<PackSection> {
  let json: Record<string, unknown>;
  try {
    json = extractJsonObject(text);
  } catch {
    // Rethrown typed: the caller retries an AdjustError once; the parser's own message adds nothing.
    throw new AdjustError(NS_ERR_INVALID);
  }
  return validateAdjusted(section, json);
}

function cancelled(): Error {
  return new DOMException('Adjust cancelled', 'AbortError');
}

async function attempt(input: AdjustInput, signal: AbortSignal): Promise<Partial<PackSection>> {
  const body = buildAdjustRequestBody(input);
  const outcome = await streamChatCompletionDetailed(body, () => undefined, signal, ADJUST_REQUEST);
  if (signal.aborted) throw cancelled();
  if (!outcome.text.trim()) {
    throw emptyError(outcome.model ?? (JSON.parse(body) as { model: string }).model, outcome.finishReason);
  }
  return parseReply(input.section, outcome.text);
}

/**
 * Resolve the adjusted section or throw: AskAIError (transport, typed),
 * AdjustError (unusable reply after one retry), or AbortError on cancel.
 */
export async function adjustSection(input: AdjustInput, signal: AbortSignal): Promise<PackSection> {
  let patch: Partial<PackSection>;
  try {
    patch = await attempt(input, signal);
  } catch (err) {
    if (!(err instanceof AdjustError)) throw err;
    patch = await attempt(input, signal);
  }
  return { ...input.section, ...patch, kind: input.section.kind, heading: input.section.heading };
}
