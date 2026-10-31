/**
 * emailAuth.test.ts — passwordless email sign-in calls · 邮箱登录调用测试 (ADR-0020)
 *
 * The shared client is mocked: signInWithOtp gets the normalised address,
 * creates new accounts, and lands on origin + path (the allowed redirect);
 * the page the sign-in started on is remembered; verifyOtp gets type
 * "email" and the code's digits only. Failures map to Chinese-first lines:
 * rate limits, the default mailer's team-only refusal, a wrong/expired code,
 * anything else with the server message; a thrown network error too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
let client: unknown = { auth: { signInWithOtp: (...a: unknown[]) => signInWithOtp(...a), verifyOtp: (...a: unknown[]) => verifyOtp(...a) } };
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => client }));
const remembered: string[] = [];
vi.mock('../../../services/authReturnHash', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../services/authReturnHash')>()),
  rememberAuthReturn: (hash: string) => { remembered.push(hash); },
}));

import {
  sendSignInEmail, verifySignInCode, classifyAuthError, normalizeEmail, isEmailAddress, normalizeCode, emailSignInAvailable,
} from '../emailAuth';
import { SI_ERR_RATE, SI_ERR_NOT_OPEN, SI_ERR_CODE_WRONG, SI_ERR_SEND, SI_ERR_VERIFY } from '../signInStrings';
import { SU_ERR_NOT_CONFIGURED } from '../../signup/signupStrings';

beforeEach(() => {
  client = { auth: { signInWithOtp: (...a: unknown[]) => signInWithOtp(...a), verifyOtp: (...a: unknown[]) => verifyOtp(...a) } };
  signInWithOtp.mockReset().mockResolvedValue({ data: {}, error: null });
  verifyOtp.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
  remembered.length = 0;
  window.location.hash = '#/new';
});

describe('input shapes', () => {
  it('addresses are trimmed and lower-cased; only a plausible address passes', () => {
    expect(normalizeEmail('  Pastor.Li@Example.ORG ')).toBe('pastor.li@example.org');
    expect(isEmailAddress('pastor.li@example.org')).toBe(true);
    for (const bad of ['', 'pastor', 'a@b', 'a b@c.d', '@c.d']) expect(isEmailAddress(bad)).toBe(false);
  });

  it('a code keeps its digits only, at most six ("123 456" and "123-456" are 123456)', () => {
    expect(normalizeCode('123 456')).toBe('123456');
    expect(normalizeCode('123-4567')).toBe('123456');
    expect(normalizeCode('ab')).toBe('');
  });
});

describe('sendSignInEmail', () => {
  it('sends to the normalised address, creates new accounts, lands on origin + path, remembers this page', async () => {
    expect(await sendSignInEmail(' Leader@Example.org ')).toBeNull();
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'leader@example.org',
      options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: true },
    });
    expect(remembered).toEqual(['#/new']);
  });

  it('an explicit returnTo wins (as for Google)', async () => {
    await sendSignInEmail('leader@example.org', '#/leader');
    expect(remembered).toEqual(['#/leader']);
  });

  it('failures: rate limit, the default mailer\'s team-only refusal, anything else with the server message, a thrown error', async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { message: 'Email rate limit exceeded', status: 429, code: 'over_email_send_rate_limit' } });
    expect(await sendSignInEmail('a@b.co')).toEqual({ kind: 'rate', message: SI_ERR_RATE });
    signInWithOtp.mockResolvedValueOnce({ error: { message: 'Email address not authorized', status: 400, code: 'email_address_not_authorized' } });
    expect(await sendSignInEmail('a@b.co')).toEqual({ kind: 'not-open', message: SI_ERR_NOT_OPEN });
    signInWithOtp.mockResolvedValueOnce({ error: { message: 'Signups not allowed', status: 422, code: 'signup_disabled' } });
    expect(await sendSignInEmail('a@b.co')).toEqual({ kind: 'other', message: `${SI_ERR_SEND} · Signups not allowed` });
    signInWithOtp.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await sendSignInEmail('a@b.co')).toEqual({ kind: 'other', message: `${SI_ERR_SEND} · Failed to fetch` });
  });

  it('no client configured → the not-configured line, nothing sent', async () => {
    client = null;
    expect(emailSignInAvailable()).toBe(false);
    expect(await sendSignInEmail('a@b.co')).toEqual({ kind: 'not-configured', message: SU_ERR_NOT_CONFIGURED });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe('verifySignInCode', () => {
  it('type "email" (new and known addresses alike), the normalised address and the code\'s digits', async () => {
    expect(await verifySignInCode('Leader@Example.org', '123 456')).toBeNull();
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'leader@example.org', token: '123456', type: 'email' });
  });

  it('a wrong or expired code says so (never which part was wrong); other failures carry the message', async () => {
    verifyOtp.mockResolvedValueOnce({ error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' } });
    expect(await verifySignInCode('a@b.co', '000000')).toEqual({ kind: 'wrong-code', message: SI_ERR_CODE_WRONG });
    verifyOtp.mockResolvedValueOnce({ error: { message: 'boom', status: 500 } });
    expect(await verifySignInCode('a@b.co', '000000')).toEqual({ kind: 'other', message: `${SI_ERR_VERIFY} · boom` });
  });
});

describe('classifyAuthError', () => {
  it('a 403 means a wrong code only when verifying; when sending it is shown with its message', () => {
    expect(classifyAuthError({ message: 'x', status: 403 }, 'verify').kind).toBe('wrong-code');
    expect(classifyAuthError({ message: 'x', status: 403 }, 'send')).toEqual({ kind: 'other', message: `${SI_ERR_SEND} · x` });
  });

  it('every line is Chinese first', () => {
    for (const line of [SI_ERR_RATE, SI_ERR_NOT_OPEN, SI_ERR_CODE_WRONG, SI_ERR_SEND, SI_ERR_VERIFY]) {
      expect(line).toMatch(/^[一-鿿]/);
    }
  });
});
