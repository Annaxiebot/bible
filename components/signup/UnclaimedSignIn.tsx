/**
 * UnclaimedSignIn.tsx — "登录以启用报名 · Sign in to enable sign-up" · 认领提示
 *
 * One shared block for the TV qr slide and #/signup when a LOCAL pack has
 * no leader yet (packSource.packSignupState === 'unclaimed'): the bilingual
 * line plus a Google sign-in button that reuses the app's auth flow
 * (authManager.signInWithGoogle — the same call AuthPanel makes). Signing
 * in claims every local pack in this browser (claimLocalPacks) and returns
 * to the same hash (authReturnHash); a claim failure renders under the line.
 */
import React, { useState } from 'react';
import { authManager, isSupabaseConfigured } from '../../services/supabase';
import { useLocalPackClaim } from '../newstudy/claimLocalPacks';
import { SU_UNCLAIMED_LINE, SU_SIGN_IN_GOOGLE, SU_SIGNING_IN, SU_ERR_NOT_CONFIGURED } from './signupStrings';

interface Props {
  packId: string;
  /** Type sizes: the TV slide passes vh-based styles, the page passes newStudyStyles. */
  lineStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
}

const buttonClass = 'rounded-xl bg-amber-500 px-8 py-3 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60';

const UnclaimedSignIn: React.FC<Props> = ({ packId, lineStyle, buttonStyle }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claim = useLocalPackClaim(packId);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    const { error: authError } = await authManager.signInWithGoogle();
    setBusy(false);
    if (authError) setError(authError.message);
  };

  const shownError = error ?? claim.failure;
  return (
    <div data-testid="qr-unclaimed" className="flex flex-col items-center gap-[3vh] text-center">
      <p className="text-slate-100" style={lineStyle}>{SU_UNCLAIMED_LINE}</p>
      {isSupabaseConfigured() ? (
        <button type="button" data-testid="qr-signin" onClick={() => void signIn()} disabled={busy}
          className={buttonClass} style={buttonStyle}>
          {busy ? SU_SIGNING_IN : SU_SIGN_IN_GOOGLE}
        </button>
      ) : (
        <p role="alert" className="text-red-300" style={lineStyle}>{SU_ERR_NOT_CONFIGURED}</p>
      )}
      {shownError && <p role="alert" className="text-red-300" style={lineStyle}>{shownError}</p>}
    </div>
  );
};

export default UnclaimedSignIn;
