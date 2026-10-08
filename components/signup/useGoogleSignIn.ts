/**
 * useGoogleSignIn.ts — the identity-only Google sign-in tap · Google 登录
 *
 * One hook (R3) behind every "用 Google 登录" button outside AuthPanel:
 * UnclaimedSignIn (claim a local pack) and the setup page's sync line. It
 * calls authManager.signInWithGoogle() (no Forms scope), reports busy while
 * the redirect starts, and surfaces the auth error for the caller to render.
 * returnTo (optional): the hash to come back to; omitted → the page the tap
 * was on (authReturnHash). Only the landing nav names one (#/leader).
 */
import { useState, useCallback } from 'react';
import { authManager } from '../../services/supabase';

export interface GoogleSignIn {
  signIn: () => Promise<void>;
  busy: boolean;
  /** The auth error message, null when none. */
  error: string | null;
}

export function useGoogleSignIn(returnTo?: string): GoogleSignIn {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    const { error: authError } = await authManager.signInWithGoogle(returnTo);
    setBusy(false);
    if (authError) setError(authError.message);
  }, [returnTo]);

  return { signIn, busy, error };
}
