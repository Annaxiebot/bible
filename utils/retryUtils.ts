/** Delays (ms) for each retry attempt: 2 s, 5 s, 10 s */
const RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

const HTTP_STATUS_RATE_LIMIT = 429;

function isRateLimitError(error: unknown): boolean {
  const err = error as { status?: number; message?: string };
  return err?.status === HTTP_STATUS_RATE_LIMIT
    || (typeof err?.message === 'string' && (
      err.message.includes('429') ||
      err.message.toLowerCase().includes('rate limit')
    ));
}

/**
 * Runs `fn` up to `maxAttempts` times, retrying on HTTP 429 rate-limit errors
 * with pre-defined exponential back-off delays. Any other error is re-thrown
 * immediately.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = RETRY_DELAYS_MS.length
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      if (isRateLimitError(error)) {
        const delay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError;
}
