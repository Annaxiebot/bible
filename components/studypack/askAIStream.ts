/**
 * askAIStream.ts — SSE streaming transport for OpenRouter · 流式回答
 *
 * Sends { stream: true } chat/completions bodies through services/aiTransport
 * (own key → OpenRouter directly; signed in → the ai-proxy function, which
 * passes OpenRouter's SSE through unchanged; neither → sign-in-needed). Chunks arrive as
 * "data: {json}" lines carrying choices[0].delta.content (and, for reasoning
 * models, delta.reasoning), the model that answered, finish_reason, and —
 * even on a 200 — an `error` object. Nothing is skipped silently: errors
 * throw an AskAIError; reasoning and finish_reason are reported so the
 * Ask-AI orchestrator (askAIFallback.ts) can retry sensibly.
 */
import { sendAIRequest, AIRole } from '../../services/aiTransport';
import { StudyPack, Slide, packContentLanguage } from './packTypes';
import { AskAIMessage, ASK_AI_MAX_TOKENS, buildAskAIPrompt } from './askAI';
import { signInNeededError, errorFromStatus, hostedErrorFromStatus, streamError, ErrorReply } from './askAIErrors';
import type { OriginalWordsVerse, RelatedVerseText } from '../../supabase/functions/_shared/aiPrompts';

/** One parsed SSE data event, reduced to what the app acts on. */
export interface SSEEvent {
  content?: string;
  /** Reasoning text (delta.reasoning / reasoning_content); counted, never shown. */
  reasoning?: string;
  model?: string;
  finishReason?: string;
  error?: { message: string; code?: string | number };
}

interface SSEChunk {
  model?: string;
  error?: { message?: string; code?: string | number };
  choices?: Array<{
    delta?: { content?: string; reasoning?: string; reasoning_content?: string };
    finish_reason?: string | null;
    error?: { message?: string; code?: string | number };
  }>;
}

function toEvent(chunk: SSEChunk): SSEEvent {
  const choice = chunk.choices?.[0];
  const error = chunk.error ?? choice?.error;
  const event: SSEEvent = {};
  if (chunk.model) event.model = chunk.model;
  if (choice?.delta?.content) event.content = choice.delta.content;
  const reasoning = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content;
  if (reasoning) event.reasoning = reasoning;
  if (choice?.finish_reason) event.finishReason = choice.finish_reason;
  if (error) event.error = { message: error.message ?? 'unknown error', code: error.code };
  return event;
}

/**
 * Stateful SSE line parser. Feed it raw text chunks in arrival order; it
 * buffers partial lines (a "data: …" line may be split across network
 * chunks), emits one SSEEvent per data line, and ignores "[DONE]".
 */
export function createSSEParser(onEvent: (event: SSEEvent) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      let parsed: SSEChunk;
      try {
        parsed = JSON.parse(payload) as SSEChunk;
      } catch {
        // Silent skip is correct here: SSE streams interleave comments and
        // keep-alive fragments that are not JSON; real failures arrive as
        // HTTP statuses, reader errors, or JSON `error` events (handled above).
        continue;
      }
      onEvent(toEvent(parsed));
    }
  };
}

export interface AskAIRequestOptions {
  model: string;
  /** Turn reasoning off (OpenRouter `reasoning` param) and raise the token cap — the retry shape. */
  noReasoning?: boolean;
  /** RELATED VERSES for the user message (ADR-0015); absent or empty → today's body exactly. */
  related?: readonly RelatedVerseText[];
  /** ORIGINAL WORDS for the user message (ADR-0018); absent or empty → no block. */
  original?: readonly OriginalWordsVerse[];
}

/** Token cap for the no-reasoning retry: room for an answer after a model that used to think first. */
export const ASK_AI_RETRY_MAX_TOKENS = 1000;

/**
 * The Ask-AI body in the data form (ADR-0014): no system message — the
 * server (or, with an own key, services/aiTransport via the same builder)
 * puts the scope guard, Ask AI's prompt, the answer contract and the
 * `content_language` rule first.
 */
export function buildRequestBody(
  pack: StudyPack,
  slide: Slide,
  history: AskAIMessage[],
  question: string,
  opts: AskAIRequestOptions
): string {
  return JSON.stringify({
    model: opts.model,
    stream: true,
    max_tokens: opts.noReasoning ? ASK_AI_RETRY_MAX_TOKENS : ASK_AI_MAX_TOKENS,
    temperature: 0.7,
    ...(opts.noReasoning ? { reasoning: { enabled: false, exclude: true } } : {}),
    content_language: packContentLanguage(pack),
    messages: [
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: buildAskAIPrompt(pack, slide, question, opts.related, opts.original) },
    ],
  });
}

/** What one streamed completion produced, beyond the text itself. */
export interface StreamOutcome {
  text: string;
  reasoningChars: number;
  /** Concrete model id from the stream chunks (the free router resolves to one). */
  model: string | null;
  finishReason: string | null;
}

function modelOf(body: string): string {
  return (JSON.parse(body) as { model?: string }).model ?? '';
}

/** Who is asking (the proxy's quota role) and the X-Title an own-key request carries (ASCII only). */
export interface AIRequestMeta {
  role: AIRole;
  title?: string;
}

/** OpenRouter X-Title (ASCII only): which part of the site sent the request. */
const DEFAULT_TITLE = 'Scripture to Life TV';

/** Send the body by the transport's route; a non-OK reply throws the mapped AskAIError. */
async function openStream(body: string, signal: AbortSignal, meta: AIRequestMeta, requested: string): Promise<Response> {
  const sent = await sendAIRequest(meta.role, body, signal, meta.title ?? DEFAULT_TITLE);
  if (sent.kind === 'sign-in-needed') throw signInNeededError(requested);
  const { response } = sent;
  if (response.ok) return response;
  const data: ErrorReply = await response.json().catch(() => ({}));
  if (sent.kind === 'hosted') throw hostedErrorFromStatus(response.status, data, requested);
  throw errorFromStatus(response.status, typeof data.error === 'object' ? data.error?.message ?? '' : '', requested);
}

/**
 * POST one chat/completions request body and stream the reply. `onDelta`
 * receives each content delta; the outcome carries the full text plus
 * reasoning volume, served model and finish_reason.
 * A user abort via `signal` resolves cleanly with whatever has arrived.
 * HTTP errors, stream `error` events and reader failures throw AskAIError.
 * Shared by the Ask-AI overlay and the pack generator (R3: one transport).
 */
export async function streamChatCompletionDetailed(
  body: string,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  meta: AIRequestMeta = { role: 'ask' },
  /** Every parsed event, before it is applied — liveness (timeout) and model reporting. */
  onEvent?: (event: SSEEvent) => void
): Promise<StreamOutcome> {
  const requested = modelOf(body);
  const response = await openStream(body, signal, meta, requested);
  const reader = response.body?.getReader();
  if (!reader) throw streamError('OpenRouter returned no response body', undefined, requested);

  const outcome: StreamOutcome = { text: '', reasoningChars: 0, model: null, finishReason: null };
  const feed = createSSEParser(event => {
    onEvent?.(event);
    if (event.model) outcome.model = event.model;
    if (event.error) throw streamError(event.error.message, event.error.code, outcome.model ?? requested);
    if (event.reasoning) outcome.reasoningChars += event.reasoning.length;
    if (event.finishReason) outcome.finishReason = event.finishReason;
    if (event.content) {
      outcome.text += event.content;
      onDelta(event.content);
    }
  });
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    // A user-initiated abort (Escape / close) is a clean cancel, not a failure.
    if ((err as Error).name === 'AbortError') return outcome;
    throw err;
  }
  return outcome;
}
