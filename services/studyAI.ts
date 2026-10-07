/**
 * studyAI.ts — the personal app's one AI path · 个人研经AI (ADR-0007 "Personal app")
 *
 * Every AI call of #app (the chat, the journal's AI tools, vibe theming)
 * goes through here, and from here through the same transport as the study
 * pages (components/studypack/askAIStream → services/aiTransport):
 *   own OpenRouter key → OpenRouter directly (the key owner's Ask-AI model);
 *   signed in → the ai-proxy function, role 'study' (server-picked model,
 *   its own monthly quota); neither → AskAIError kind 'sign-in-needed'.
 * Failures are AskAIErrors carrying the TV overlay's bilingual lines
 * (askAIErrors / tvHints), so the chat shows them the same way.
 * Requests always stream (the proxy passes OpenRouter's SSE through);
 * chatStudyAI simply collects the stream for callers that want the text.
 */
import { streamChatCompletionDetailed } from '../components/studypack/askAIStream';
import { emptyError } from '../components/studypack/askAIErrors';
import { ROLE_MAX_TOKENS, MAX_MESSAGES, MAX_TOTAL_CHARS } from '../supabase/functions/ai-proxy/policy';
import { askAIModel } from './aiDefaults';

/** OpenRouter X-Title for own-key requests (ASCII only). */
export const STUDY_AI_TITLE = 'Scripture to Life';
const STUDY_TEMPERATURE = 0.7;

export interface StudyAIMessage { role: string; content: string }

export interface StudyAIOptions {
  /** A system message ahead of the history (the chat's scholar prompt); none when omitted. */
  system?: string;
  /** Aborting resolves with whatever text has arrived. */
  signal?: AbortSignal;
}

export interface StudyAIResult {
  text: string;
  /** The model that answered (from the stream), else the one requested. */
  model: string;
}

/**
 * The newest history that fits the proxy's limits (policy MAX_MESSAGES /
 * MAX_TOTAL_CHARS) next to the system message and the new prompt — older
 * turns drop first, so a long thread never turns into a 400.
 */
export function fitHistory(history: readonly StudyAIMessage[], fixedChars: number, fixedMessages: number): StudyAIMessage[] {
  const kept: StudyAIMessage[] = [];
  let chars = fixedChars;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (kept.length + fixedMessages >= MAX_MESSAGES || chars + m.content.length > MAX_TOTAL_CHARS) break;
    kept.unshift({ role: m.role, content: m.content });
    chars += m.content.length;
  }
  return kept;
}

/** The chat/completions body (OpenRouter shape; the transport adds role 'study' for the proxy). */
export function buildStudyBody(prompt: string, history: readonly StudyAIMessage[], system?: string): string {
  const head = system ? [{ role: 'system', content: system }] : [];
  const fixedChars = prompt.length + (system?.length ?? 0);
  return JSON.stringify({
    model: askAIModel(),
    stream: true,
    max_tokens: ROLE_MAX_TOKENS.study,
    temperature: STUDY_TEMPERATURE,
    messages: [...head, ...fitHistory(history, fixedChars, head.length + 1), { role: 'user', content: prompt }],
  });
}

/**
 * Stream one answer; `onChunk` receives each content delta. Throws an
 * AskAIError (sign-in-needed, quota, HTTP, stream, empty…); a user abort
 * resolves with the partial (possibly empty) text instead.
 */
export async function streamStudyAI(
  prompt: string,
  history: readonly StudyAIMessage[],
  onChunk: (text: string) => void,
  opts: StudyAIOptions = {},
): Promise<StudyAIResult> {
  const body = buildStudyBody(prompt, history, opts.system);
  const requested = (JSON.parse(body) as { model: string }).model;
  const signal = opts.signal ?? new AbortController().signal;
  const outcome = await streamChatCompletionDetailed(body, onChunk, signal, { role: 'study', title: STUDY_AI_TITLE });
  const model = outcome.model ?? requested;
  if (!outcome.text && !signal.aborted) throw emptyError(model, outcome.finishReason);
  return { text: outcome.text, model };
}

/** One answer as text (the stream collected). Same routing and errors as streamStudyAI. */
export function chatStudyAI(prompt: string, history: readonly StudyAIMessage[] = [], opts: StudyAIOptions = {}): Promise<StudyAIResult> {
  return streamStudyAI(prompt, history, () => undefined, opts);
}
