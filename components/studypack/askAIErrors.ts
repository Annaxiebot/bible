/**
 * askAIErrors.ts — typed failures of the Ask-AI path · 问AI错误类型
 *
 * Every failure the overlay can show is an AskAIError with a `kind`; the
 * kind decides which buttons accompany the line (Set up AI / Retry) and
 * whether the transport may try a fallback model. Strings come from
 * tvHints.ts (R3); this module only assembles them.
 */
import { classifyOpenRouterStatus } from '../../services/openrouterStatus';
import {
  AI_NOT_CONFIGURED_MESSAGE, AI_CREDITS_MESSAGE, AI_INVALID_KEY_MESSAGE, AI_REQUEST_FAILED,
  modelUnavailableLine, httpDetail, streamErrorLine, timeoutLine, withModel,
  AI_EMPTY, AI_BUDGET_SPENT, AI_FILTERED, AI_NETWORK_ERROR,
} from './tvHints';

export type AskAIErrorKind =
  | 'not-configured'
  | 'invalid-key'
  | 'no-credits'
  | 'model-unavailable'
  | 'http-error'
  | 'stream-error'
  | 'timeout'
  | 'network'
  | 'empty'
  | 'budget'
  | 'filtered';

export class AskAIError extends Error {
  readonly kind: AskAIErrorKind;
  /** The model the failing request named (concrete id when the stream told us). */
  readonly model: string;
  readonly status?: number;
  constructor(kind: AskAIErrorKind, message: string, model: string, status?: number) {
    super(message);
    this.name = 'AskAIError';
    this.kind = kind;
    this.model = model;
    this.status = status;
  }
}

/** Kinds whose line gets a "Set up AI" button (a stored key/model is the likely cause). */
export const SETUP_KINDS: ReadonlySet<AskAIErrorKind> = new Set<AskAIErrorKind>([
  'not-configured', 'invalid-key', 'no-credits', 'model-unavailable', 'timeout', 'empty', 'budget',
]);

/** Kinds whose line gets a "Retry" button (the same request may well succeed). */
export const RETRY_KINDS: ReadonlySet<AskAIErrorKind> = new Set<AskAIErrorKind>([
  'timeout', 'http-error', 'stream-error', 'network', 'empty', 'budget',
]);

/** Kinds after which the transport tries one fallback model before giving up. */
export const FALLBACK_KINDS: ReadonlySet<AskAIErrorKind> = new Set<AskAIErrorKind>([
  'model-unavailable', 'http-error', 'stream-error',
]);

export function notConfiguredError(model: string): AskAIError {
  return new AskAIError('not-configured', AI_NOT_CONFIGURED_MESSAGE, model);
}

/** A non-OK HTTP reply → the bilingual line for its status, always carrying status + API message. */
export function errorFromStatus(status: number, apiMessage: string, model: string): AskAIError {
  const kind = classifyOpenRouterStatus(status);
  const detail = httpDetail(status, apiMessage);
  const base = {
    'invalid-key': AI_INVALID_KEY_MESSAGE,
    'no-credits': AI_CREDITS_MESSAGE,
    'model-unavailable': modelUnavailableLine(model),
    'http-error': AI_REQUEST_FAILED,
  }[kind];
  return new AskAIError(kind, `${base} · ${detail}`, model, status);
}

/** An `error` object OpenRouter sent inside a 200 stream. */
export function streamError(message: string, code: string | number | undefined, model: string): AskAIError {
  return new AskAIError('stream-error', streamErrorLine(message, code), model);
}

export function timeoutError(model: string, ms: number): AskAIError {
  return new AskAIError('timeout', timeoutLine(model, ms), model);
}

/** The stream ended OK but produced no content; `finishReason` picks the explanation. */
export function emptyError(model: string, finishReason: string | null): AskAIError {
  if (finishReason === 'content_filter') return new AskAIError('filtered', withModel(AI_FILTERED, model), model);
  if (finishReason === 'length') return new AskAIError('budget', withModel(AI_BUDGET_SPENT, model), model);
  return new AskAIError('empty', withModel(AI_EMPTY, model), model);
}

/** Wrap anything that is not already an AskAIError (fetch TypeError, reader failure). */
export function asAskAIError(err: unknown, model: string): AskAIError {
  if (err instanceof AskAIError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AskAIError('network', `${AI_NETWORK_ERROR}: ${message}`, model);
}
