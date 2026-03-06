import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../retryUtils';

// Speed up: replace real delays with instant resolution
vi.stubGlobal('setTimeout', (fn: () => void) => { fn(); return 0; });

describe('withRetry', () => {
  it('returns immediately when fn succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on rate-limit error (status 429) and succeeds', async () => {
    const rateLimitErr = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on message containing "429"', async () => {
    const err = new Error('HTTP 429 Too Many Requests');
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn);
    expect(result).toBe('ok');
  });

  it('retries on message containing "rate limit" (OpenRouter text)', async () => {
    const err = new Error('Rate limit exceeded: free-models-per-min');
    const fn = vi.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws immediately for non-rate-limit errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network failure'));
    await expect(withRetry(fn)).rejects.toThrow('Network failure');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('exhausts all attempts and throws last error', async () => {
    const rateLimitErr = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = vi.fn().mockRejectedValue(rateLimitErr);

    await expect(withRetry(fn, 3)).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('respects custom maxAttempts', async () => {
    const rateLimitErr = Object.assign(new Error('too many'), { status: 429 });
    const fn = vi.fn().mockRejectedValue(rateLimitErr);

    await expect(withRetry(fn, 2)).rejects.toBeDefined();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
