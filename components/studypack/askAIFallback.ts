/**
 * askAIFallback.ts — Ask-AI orchestration: timeout, reasoning retry, fallback · 问AI重试策略
 *
 * One question may take up to three streamed attempts:
 *   1. the resolved model as configured;
 *   2. if that stream ended with reasoning but no content (or finish_reason
 *      "length"), the same model with reasoning turned off and a larger cap;
 *   3. once, the first fallback entry (services/aiDefaults askAIFallbackModels:
 *      the #/setup choice, else ASK_AI_FALLBACK_MODELS) that differs from the
 *      model that failed — after an empty answer, a model/HTTP/stream error.
 * Each attempt aborts if no token arrives within the first-token budget.
 * Invalid key, no credits, a content filter and a user cancel never retry.
 */
import { askAIFallbackModels } from '../../services/aiDefaults';
import { StudyPack, Slide } from './packTypes';
import { AskAIMessage, resolveAskAIModel } from './askAI';
import { buildRequestBody, streamChatCompletionDetailed, StreamOutcome } from './askAIStream';
import { AskAIError, FALLBACK_KINDS, asAskAIError, emptyError, timeoutError } from './askAIErrors';
import { RELATED_VERSES_ENABLED, RelatedVerse, loadRelatedVerses } from './relatedVerses';
import { QUESTION_AWARE_ENABLED, questionAwareChooser } from './relatedPick';

export const ASK_AI_FIRST_TOKEN_TIMEOUT_MS = 20_000;

/**
 * First-token budget. Dev builds (vite dev / Playwright) honour
 * window.__ASK_AI_TIMEOUT_MS so the e2e hang test finishes in seconds; a
 * production build never reads it.
 */
export function firstTokenTimeoutMs(): number {
  if (import.meta.env.DEV) {
    const override = (window as Window & { __ASK_AI_TIMEOUT_MS?: unknown }).__ASK_AI_TIMEOUT_MS;
    if (typeof override === 'number' && override > 0) return override;
  }
  return ASK_AI_FIRST_TOKEN_TIMEOUT_MS;
}

export interface AskAIResult {
  text: string;
  /** The model that answered (concrete id from the stream when OpenRouter named one). */
  model: string;
}

interface Attempt {
  model: string;
  noReasoning: boolean;
}

/** One streamed attempt under a first-token timeout. Throws AskAIError or rethrows a user AbortError. */
async function runAttempt(
  body: string,
  attempt: Attempt,
  onText: (accumulated: string) => void,
  onModel: ((model: string) => void) | undefined,
  signal: AbortSignal
): Promise<StreamOutcome> {
  const inner = new AbortController();
  const forward = () => inner.abort();
  if (signal.aborted) inner.abort(); else signal.addEventListener('abort', forward);
  const timeoutMs = firstTokenTimeoutMs();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; inner.abort(); }, timeoutMs);
  let raw = '';
  let named: string | null = null;
  try {
    const outcome = await streamChatCompletionDetailed(
      body,
      delta => { raw += delta; onText(raw.trim()); },
      inner.signal,
      { role: 'ask' },
      event => {
        if (event.content || event.reasoning) clearTimeout(timer); // any token: the model is alive
        if (event.model && event.model !== named) { named = event.model; onModel?.(event.model); }
      }
    );
    if (timedOut) throw timeoutError(outcome.model ?? attempt.model, timeoutMs);
    return outcome;
  } catch (err) {
    if (timedOut && !signal.aborted) throw timeoutError(attempt.model, timeoutMs);
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forward);
  }
}

/** The first fallback id that is none of the models already tried; undefined when exhausted. */
export function nextFallbackModel(tried: ReadonlySet<string>): string | undefined {
  return askAIFallbackModels().find(id => !tried.has(id));
}

/**
 * RELATED VERSES for this question (ADR-0015) — none while the switch is off: no fetch, today's request.
 * With QUESTION_AWARE_ENABLED (ADR-0016) a short 'pick' call chooses them from the pool first.
 */
async function relatedFor(pack: StudyPack, question: string, signal: AbortSignal): Promise<RelatedVerse[]> {
  if (!RELATED_VERSES_ENABLED) return [];
  // Failures and the pick's fallback reason are in the result's warnings + source
  // (relatedVerses.lastRelatedVerses); the answer goes ahead with what loaded.
  if (!QUESTION_AWARE_ENABLED) return (await loadRelatedVerses(pack, question)).related;
  const chooser = questionAwareChooser({ passageRef: pack.passageRef, question, model: resolveAskAIModel(), signal });
  return (await loadRelatedVerses(pack, question, chooser)).related;
}

/**
 * Ask one question with a streamed answer. `onText` receives the accumulated,
 * trimmed answer after every delta; `onModel` the model in play.
 * A user abort via `signal` resolves cleanly with whatever has arrived.
 * Every failure rejects with an AskAIError (the overlay maps kind → buttons).
 */
export async function streamStudyAI(
  pack: StudyPack,
  slide: Slide,
  history: AskAIMessage[],
  question: string,
  onText: (accumulated: string) => void,
  signal: AbortSignal,
  onModel?: (model: string) => void
): Promise<AskAIResult> {
  const tried = new Set<string>();
  const plan: Attempt[] = [{ model: resolveAskAIModel(), noReasoning: false }];
  let fallbackUsed = false;
  let last: AskAIError | null = null;
  const queueFallback = (failed: string) => {
    if (fallbackUsed) return;
    const next = nextFallbackModel(new Set([...tried, failed]));
    if (!next) return;
    fallbackUsed = true;
    plan.push({ model: next, noReasoning: true });
  };

  const related = await relatedFor(pack, question, signal);
  for (let attempt = plan.shift(); attempt; attempt = plan.shift()) {
    tried.add(attempt.model);
    onModel?.(attempt.model);
    const body = buildRequestBody(pack, slide, history, question, { ...attempt, related });
    let outcome: StreamOutcome;
    try {
      outcome = await runAttempt(body, attempt, onText, onModel, signal);
    } catch (err) {
      if (signal.aborted) throw err; // user cancel: the caller ignores it
      last = asAskAIError(err, attempt.model);
      if (FALLBACK_KINDS.has(last.kind)) { queueFallback(last.model); continue; }
      throw last;
    }
    const served = outcome.model ?? attempt.model;
    if (signal.aborted || outcome.text.length > 0) {
      return { text: outcome.text.trim(), model: served };
    }
    last = emptyError(served, outcome.finishReason);
    if (last.kind === 'filtered') throw last;
    const reasonedOnly = outcome.reasoningChars > 0 || outcome.finishReason === 'length';
    if (!attempt.noReasoning && reasonedOnly) plan.push({ model: attempt.model, noReasoning: true });
    else queueFallback(served);
  }
  throw last ?? emptyError(resolveAskAIModel(), null);
}
