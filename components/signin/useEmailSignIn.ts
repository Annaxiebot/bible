/**
 * useEmailSignIn.ts — the email sign-in steps · 邮箱登录状态 (ADR-0020)
 *
 * closed → email (type the address) → sent (check your email; a box for the
 * 6-digit code, for signing in on a device other than the one reading the
 * email) → done (the code was accepted; the session then replaces the
 * sign-in UI). Every failure stays on its step with a bilingual line; "Use
 * another email" goes back to the address. Calls live in emailAuth.ts.
 * A send with a well-formed address counts "sign-in started (email)"; an
 * accepted code counts "finished" (anonymous funnel, ADR-0025).
 */
import { useState, useCallback } from 'react';
import { EMAIL_CODE_LENGTH } from '../../supabase/auth/emailSignIn';
import { isEmailAddress, normalizeCode, sendSignInEmail, verifySignInCode } from './emailAuth';
import { SI_ERR_EMAIL, SI_ERR_CODE } from './signInStrings';
import { noteSignInStart, finishSignIn } from '../stats/funnelSignIn';

export type EmailStep = 'closed' | 'email' | 'sent' | 'done';

export interface EmailSignIn {
  step: EmailStep;
  email: string;
  code: string;
  busy: boolean;
  /** The bilingual failure line of the current step; null when none. */
  error: string | null;
  open: () => void;
  setEmail: (value: string) => void;
  setCode: (value: string) => void;
  send: () => Promise<void>;
  verify: () => Promise<void>;
  otherEmail: () => void;
}

export function useEmailSignIn(returnTo?: string): EmailSignIn {
  const [step, setStep] = useState<EmailStep>('closed');
  const [email, setEmailRaw] = useState('');
  const [code, setCodeRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setEmail = useCallback((value: string) => { setEmailRaw(value); setError(null); }, []);
  const setCode = useCallback((value: string) => { setCodeRaw(normalizeCode(value)); setError(null); }, []);
  const open = useCallback(() => setStep('email'), []);
  const otherEmail = useCallback(() => { setStep('email'); setCodeRaw(''); setError(null); }, []);

  const send = useCallback(async () => {
    if (!isEmailAddress(email)) { setError(SI_ERR_EMAIL); return; }
    noteSignInStart('email');
    setBusy(true);
    const failure = await sendSignInEmail(email, returnTo);
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    setStep('sent');
  }, [email, returnTo]);

  const verify = useCallback(async () => {
    if (code.length !== EMAIL_CODE_LENGTH) { setError(SI_ERR_CODE); return; }
    setBusy(true);
    const failure = await verifySignInCode(email, code);
    setBusy(false);
    if (failure) { setError(failure.message); return; }
    finishSignIn();
    setStep('done');
  }, [email, code]);

  return { step, email, code, busy, error, open, setEmail, setCode, send, verify, otherEmail };
}
