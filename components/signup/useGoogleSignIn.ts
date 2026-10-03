/**
 * useGoogleSignIn.ts — the identity-only Google sign-in tap · Google 登录
 *
 * One hook (R3) behind every "用 Google 登录" button outside AuthPanel:
 * UnclaimedSignIn (claim a local pack) and the setup page's sync line. It
 * calls authManager.signInWithGoogle() (no Forms scope), reports busy while
 * the redirect starts, and surfaces the auth error for the caller to render.
 */
import { useState, useCallback } from 'react';
import { authManager } from '../../services/supabase';

export interface GoogleSignIn {
  signIn: () => Promise<void>;
  busy: boolean;
  /** The auth error message, null when none. */
  error: string | null;
}

export function useGoogleSignIn(): GoogleSignIn {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    const { error: authError } = await authManager.signInWithGoogle();
    setBusy(false);
    if (authError) setError(authError.message);
  }, []);

  return { signIn, busy, error };
}
