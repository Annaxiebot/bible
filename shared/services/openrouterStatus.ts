/**
 * openrouterStatus.ts — what an OpenRouter HTTP status means · 状态码含义
 *
 * Single source (R3) for the status → failure-kind mapping that the quick
 * setup Test (components/setup) and the TV Ask-AI overlay (components/
 * studypack) both render. Pure module: no fetch, no React, no storage.
 */

export const HTTP_BAD_REQUEST = 400;
export const HTTP_UNAUTHORIZED = 401;
/** OpenRouter returns 402 when the account has no credits for the model. */
export const HTTP_PAYMENT_REQUIRED = 402;
export const HTTP_FORBIDDEN = 403;
export const HTTP_NOT_FOUND = 404;

export type OpenRouterFailureKind =
  | 'invalid-key'        // 401 / 403: the key is wrong, revoked, or disabled
  | 'no-credits'         // 402: the chosen model needs credits
  | 'model-unavailable'  // 400 / 404: the model id is unknown or not routable
  | 'http-error';        // anything else non-OK (429, 5xx, …)

/** Classify a non-OK OpenRouter status. Callers map the kind to their own bilingual string. */
export function classifyOpenRouterStatus(status: number): OpenRouterFailureKind {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return 'invalid-key';
  if (status === HTTP_PAYMENT_REQUIRED) return 'no-credits';
  if (status === HTTP_BAD_REQUEST || status === HTTP_NOT_FOUND) return 'model-unavailable';
  return 'http-error';
}
