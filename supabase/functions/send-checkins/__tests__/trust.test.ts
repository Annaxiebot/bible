/**
 * trust.test.ts — the trusted-caller gate of send-checkins · 可信调用方测试
 *
 * Only an exact match of a configured, non-empty secret is trusted: an empty
 * secret trusts nobody (a misconfigured project cannot be driven from
 * outside), a wrong or missing header is untrusted. The welcome uses the
 * same gate (ADR-0013): an anonymous welcome is refused with a reason (the
 * function answers 403), the signup function's trusted request passes, and
 * index.ts checks it before it reads the signup row.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { isTrustedCaller, welcomeCallerProblem, CRON_SECRET_HEADER, WELCOME_UNTRUSTED } from '../trust.ts';

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

describe('welcomeCallerProblem (the anonymous welcome is closed)', () => {
  it('an anonymous caller (no header, wrong header, or no secret configured) is refused with the reason', () => {
    expect(welcomeCallerProblem(null, 's3cret-value')).toBe(WELCOME_UNTRUSTED);
    expect(welcomeCallerProblem('guess', 's3cret-value')).toBe(WELCOME_UNTRUSTED);
    expect(welcomeCallerProblem('', '')).toBe(WELCOME_UNTRUSTED);
  });

  it('the trusted caller (the signup function) may ask for the welcome', () => {
    expect(welcomeCallerProblem('s3cret-value', 's3cret-value')).toBeNull();
  });

  it('index.ts: handleWelcome answers 403 on the gate before reading the row; the welcome window still applies after it', () => {
    const source = readFileSync(path.resolve(__dirname, '../index.ts'), 'utf-8');
    const welcome = source.slice(source.indexOf('async function handleWelcome('), source.indexOf('async function handle('));
    const gate = welcome.indexOf("welcomeCallerProblem(request.headers.get(CRON_SECRET_HEADER), env('CHECKIN_CRON_SECRET'))");
    expect(gate).toBeGreaterThan(-1);
    expect(welcome).toContain('if (refused) return jsonResponse(403, { error: refused });');
    expect(gate).toBeLessThan(welcome.indexOf('loadSignup('));
    expect(welcome.indexOf('welcomeAllowed(row, now)')).toBeGreaterThan(gate);
    expect(source).toContain('return handleWelcome(request, body, now);');
  });
});
