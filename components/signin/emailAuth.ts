/**
 * emailAuth.ts — passwordless email sign-in calls · 邮箱登录 (ADR-0020)
 *
 * Supabase Auth signInWithOtp sends ONE email with a one-click link and a
 * 6-digit code (template: supabase/auth/emailSignIn.ts); verifyOtp turns the
 * typed code into a session on this device. The link lands on origin + path
 * (the allowed redirect, as Google's does) and the page the sign-in started
 * on is remembered (services/authReturnHash), so either way the leader comes
 * back to where they were. The same address via Google or email is the same
 * account (Supabase links identities by verified email). New addresses are
 * created on first sign-in. Failures come back typed with a bilingual line;
 * success never says whether the address already had an account.
 * The client is the app's shared one (getSignupClient: the real client, or
 * in dev/e2e the window.__SUPABASE_E2E__ stand-in).
 */
import { getSignupClient } from '../signup/signupClient';
import { rememberAuthReturn, authReturnTarget } from '../../services/authReturnHash';
import { EMAIL_CODE_LENGTH } from '../../supabase/auth/emailSignIn';
import { EMAIL_SHAPE } from '../../supabase/functions/_shared/feedback';
import { SU_ERR_NOT_CONFIGURED } from '../signup/signupStrings';
import {
  SI_ERR_RATE, SI_ERR_NOT_OPEN, SI_ERR_CODE_WRONG, SI_ERR_SEND, SI_ERR_VERIFY,
} from './signInStrings';

export type EmailAuthFailureKind = 'not-configured' | 'rate' | 'not-open' | 'wrong-code' | 'other';
export interface EmailAuthFailure { kind: EmailAuthFailureKind; message: string }

/** The parts of a supabase-js AuthError this module reads. */
export interface AuthErrorLike { message: string; status?: number; code?: string }

const HTTP_TOO_MANY = 429;
const HTTP_FORBIDDEN = 403;
const RATE_CODES = new Set(['over_email_send_rate_limit', 'over_request_rate_limit']);
const WRONG_CODE_CODES = new Set(['otp_expired', 'otp_disabled']);

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** The sign-up form's whole-field shape check (one rule, R3); the email itself proves the address. */
export function isEmailAddress(raw: string): boolean {
  return EMAIL_SHAPE.test(normalizeEmail(raw));
}

/** Digits only, at most the code length (pasted "123 456" or "123-456" becomes "123456"). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH);
}

/** An auth error → the line the leader sees. `step` picks the prefix of an unexpected one. */
export function classifyAuthError(err: AuthErrorLike, step: 'send' | 'verify'): EmailAuthFailure {
  if (err.status === HTTP_TOO_MANY || (err.code && RATE_CODES.has(err.code))) return { kind: 'rate', message: SI_ERR_RATE };
  if (err.code === 'email_address_not_authorized') return { kind: 'not-open', message: SI_ERR_NOT_OPEN };
  if (step === 'verify' && (err.status === HTTP_FORBIDDEN || (err.code && WRONG_CODE_CODES.has(err.code)))) {
    return { kind: 'wrong-code', message: SI_ERR_CODE_WRONG };
  }
  return { kind: 'other', message: `${step === 'send' ? SI_ERR_SEND : SI_ERR_VERIFY} · ${err.message}` };
}

const NOT_CONFIGURED: EmailAuthFailure = { kind: 'not-configured', message: SU_ERR_NOT_CONFIGURED };

/** True when an email can be sent (a configured client exists). */
export function emailSignInAvailable(): boolean {
  return getSignupClient() !== null;
}

/**
 * Send the link + code to `email`; null on success. `returnTo` as for Google
 * (omitted → the page the sign-in started on). A thrown network error is
 * returned as a failure, never swallowed.
 */
export async function sendSignInEmail(email: string, returnTo?: string): Promise<EmailAuthFailure | null> {
  const client = getSignupClient();
  if (!client) return NOT_CONFIGURED;
  rememberAuthReturn(authReturnTarget(window.location.hash, returnTo));
  try {
    const { error } = await client.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: true },
    });
    return error ? classifyAuthError(error, 'send') : null;
  } catch (err) {
    return classifyAuthError({ message: err instanceof Error ? err.message : String(err) }, 'send');
  }
}

/** Sign in on this device with the emailed code; null on success (the session follows through the auth manager). */
export async function verifySignInCode(email: string, code: string): Promise<EmailAuthFailure | null> {
  const client = getSignupClient();
  if (!client) return NOT_CONFIGURED;
  try {
    const { error } = await client.auth.verifyOtp({ email: normalizeEmail(email), token: normalizeCode(code), type: 'email' });
    return error ? classifyAuthError(error, 'verify') : null;
  } catch (err) {
    return classifyAuthError({ message: err instanceof Error ? err.message : String(err) }, 'verify');
  }
}
