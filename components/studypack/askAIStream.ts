/**
 * askAIStream.ts — SSE streaming transport for OpenRouter · 流式回答
 *
 * Hits the same chat/completions endpoint as services/openrouter.ts (key
 * and URL reused from there) with { stream: true }. Chunks arrive as
 * "data: {json}" lines carrying choices[0].delta.content (and, for reasoning
 * models, delta.reasoning), the model that answered, finish_reason, and —
 * even on a 200 — an `error` object. Nothing is skipped silently: errors
 * throw an AskAIError; reasoning and finish_reason are reported so the
 * Ask-AI orchestrator (askAIFallback.ts) can retry sensibly.
 */
import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from '../../services/systemPrompts';
import { getApiKey, OPENROUTER_API_URL } from '../../services/openrouter';
import { StudyPack, Slide } from './packTypes';
import { AskAIMessage, ASK_AI_MAX_TOKENS, buildAskAIPrompt } from './askAI';
import { notConfiguredError, errorFromStatus, streamError } from './askAIErrors';

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
}

/** Token cap for the no-reasoning retry: room for an answer after a model that used to think first. */
export const ASK_AI_RETRY_MAX_TOKENS = 600;

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
    messages: [
      { role: 'system', content: BIBLE_SCHOLAR_SYSTEM_PROMPT },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: buildAskAIPrompt(pack, slide, question) },
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

/**
 * POST one chat/completions request body to OpenRouter and stream the
 * reply. `onDelta` receives each content delta; the outcome carries the
 * full text plus reasoning volume, served model and finish_reason.
 * A user abort via `signal` resolves cleanly with whatever has arrived.
 * HTTP errors, stream `error` events and reader failures throw AskAIError.
 * Shared by the Ask-AI overlay and the pack generator (R3: one transport).
 */
export async function streamChatCompletionDetailed(
  body: string,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  title = 'Scripture Scholar TV',
  /** Every parsed event, before it is applied — liveness (timeout) and model reporting. */
  onEvent?: (event: SSEEvent) => void
): Promise<StreamOutcome> {
  const requested = modelOf(body);
  const apiKey = getApiKey();
  if (!apiKey) throw notConfiguredError(requested);
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': title,
    },
    body,
  });
  if (!response.ok) {
    const data: { error?: { message?: string } } = await response.json().catch(() => ({}));
    throw errorFromStatus(response.status, data.error?.message ?? '', requested);
  }
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

/** Text-only convenience over streamChatCompletionDetailed (pack generation). */
export async function streamChatCompletion(
  body: string,
  onDelta: (delta: string) => void,
  signal: AbortSignal,
  title?: string
): Promise<string> {
  return (await streamChatCompletionDetailed(body, onDelta, signal, title)).text;
}
