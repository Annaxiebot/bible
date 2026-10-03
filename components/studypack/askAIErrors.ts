/**
 * askAIErrors.ts — typed failures of the Ask-AI path · 问AI错误类型
 *
 * Every failure the overlay can show is an AskAIError with a `kind`; the
 * kind decides which buttons accompany the line (Set up AI / Retry) and
 * whether the transport may try a fallback model. Strings come from
 * tvHints.ts (R3); this module only assembles them. Own-key replies map by
 * OpenRouter status (errorFromStatus); hosted replies (services/aiTransport
 * → ai-proxy) by the proxy's typed body first (hostedErrorFromStatus).
 */
import { classifyOpenRouterStatus } from '../../services/openrouterStatus';
import {
  AI_SIGN_IN_NEEDED, AI_CREDITS_MESSAGE, AI_INVALID_KEY_MESSAGE, AI_REQUEST_FAILED,
  modelUnavailableLine, httpDetail, streamErrorLine, timeoutLine, withModel,
  AI_EMPTY, AI_BUDGET_SPENT, AI_FILTERED, AI_NETWORK_ERROR,
  quotaLine, AI_CREDIT_USED_UP, AI_SERVICE_PAUSED,
} from './tvHints';

export type AskAIErrorKind =
  | 'sign-in-needed'
  | 'invalid-key'
  | 'no-credits'
  | 'quota'
  | 'credit-used-up'
  | 'service-paused'
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

/** Kinds whose line gets a "Set up AI" button (sign in, or a stored key/model, is the way out). */
export const SETUP_KINDS: ReadonlySet<AskAIErrorKind> = new Set<AskAIErrorKind>([
  'sign-in-needed', 'invalid-key', 'no-credits', 'model-unavailable', 'timeout', 'empty', 'budget',
]);

/** Hosted kinds whose line links to the AI service page's own-key option (the only such hint, ADR-0007). */
export const OWN_KEY_LINK_KINDS: ReadonlySet<AskAIErrorKind> = new Set<AskAIErrorKind>([
  'credit-used-up', 'service-paused',
]);

/** Kinds whose line gets a "Retry" button (the same request may well succeed). */
export const RETRY_KINDS: ReadonlySet<AskAIErrorKind> = new Set<AskAIErrorKind>([
  'timeout', 'http-error', 'stream-error', 'network', 'empty', 'budget',
]);

/** Kinds after which the transport tries one fallback model before giving up. */
export const FALLBACK_KINDS: ReadonlySet<AskAIErrorKind> = new Set<AskAIErrorKind>([
  'model-unavailable', 'http-error', 'stream-error',
]);

export function signInNeededError(model: string): AskAIError {
  return new AskAIError('sign-in-needed', AI_SIGN_IN_NEEDED, model);
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

/** A non-OK reply's JSON: the proxy's own errors carry a string `error`, OpenRouter's an object. */
export interface ErrorReply {
  error?: string | { message?: string };
  limit?: number;
  detail?: string;
}

/**
 * A non-OK reply from the hosted proxy. 401 (expired session) → sign in
 * again; the proxy's typed 429 quota / 402 no-credit / 503 → their own
 * lines (never a fallback attempt); anything else is OpenRouter's reply
 * passed through → the own-key mapping.
 */
export function hostedErrorFromStatus(status: number, data: ErrorReply, model: string): AskAIError {
  if (status === 401) return new AskAIError('sign-in-needed', AI_SIGN_IN_NEEDED, model, status);
  const code = typeof data.error === 'string' ? data.error : null;
  if (code === 'quota') return new AskAIError('quota', quotaLine(data.limit ?? 0), model, status);
  if (code === 'no-credit') return new AskAIError('credit-used-up', AI_CREDIT_USED_UP, model, status);
  if (status === 503) return new AskAIError('service-paused', `${AI_SERVICE_PAUSED} · ${httpDetail(status, code ?? '')}`, model, status);
  if (code) return new AskAIError('http-error', `${AI_REQUEST_FAILED} · ${httpDetail(status, data.detail ?? code)}`, model, status);
  const message = typeof data.error === 'object' ? data.error?.message ?? '' : '';
  return errorFromStatus(status, message, model);
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
