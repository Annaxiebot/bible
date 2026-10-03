/**
 * trust.test.ts — the trusted-caller gate of send-checkins · 可信调用方测试
 *
 * Only an exact match of a configured, non-empty secret is trusted: an empty
 * secret trusts nobody (a misconfigured project cannot be driven from
 * outside), a wrong or missing header is untrusted.
 */
import { describe, it, expect } from 'vitest';
import { isTrustedCaller, CRON_SECRET_HEADER } from '../trust.ts';

describe('isTrustedCaller', () => {
  it('a matching secret header is trusted', () => {
    expect(isTrustedCaller('s3cret-value', 's3cret-value')).toBe(true);
  });

  it('an empty CHECKIN_CRON_SECRET trusts nobody, even an empty header', () => {
    expect(isTrustedCaller('', '')).toBe(false);
    expect(isTrustedCaller(null, '')).toBe(false);
    expect(isTrustedCaller('anything', '')).toBe(false);
  });

  it('a wrong or missing header is untrusted', () => {
    expect(isTrustedCaller('wrong', 's3cret-value')).toBe(false);
    expect(isTrustedCaller(null, 's3cret-value')).toBe(false);
    expect(isTrustedCaller('s3cret-value ', 's3cret-value')).toBe(false);   // no trimming: exact match only
  });

  it('the header name is the one the runbook tells pg_cron to send', () => {
    expect(CRON_SECRET_HEADER).toBe('x-checkin-secret');
  });
});
