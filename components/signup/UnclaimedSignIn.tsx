/**
 * UnclaimedSignIn.tsx — "登录以启用报名 · Sign in to enable sign-up" · 认领提示
 *
 * One shared block for the TV qr slide and #/signup when a LOCAL pack has
 * no leader yet (packSource.packSignupState === 'unclaimed'): the bilingual
 * line plus a Google sign-in button that reuses the app's auth flow
 * (useGoogleSignIn → authManager.signInWithGoogle, the same call AuthPanel
 * makes). Signing in claims every local pack in this browser
 * (claimLocalPacks) and returns to the same hash (authReturnHash); a claim
 * failure renders under the line.
 */
import React from 'react';
import { isSupabaseConfigured } from '../../services/supabase';
import { useGoogleSignIn } from './useGoogleSignIn';
import { useLocalPackClaim } from '../newstudy/claimLocalPacks';
import { SU_UNCLAIMED_LINE, SU_SIGN_IN_GOOGLE, SU_SIGNING_IN, SU_ERR_NOT_CONFIGURED } from './signupStrings';
import Pill from '../shared/Pill';
import { PAPER_ERROR_CLASS } from '../shared/paperStyles';

interface Props {
  packId: string;
  /** Type sizes: the TV slide passes vh-based styles, the page passes newStudyStyles. */
  lineStyle: React.CSSProperties;
  buttonStyle: React.CSSProperties;
  /** On a paper member page (#/signup, #/qr): ink text, the gold Pill, a paper-safe error colour. */
  paper?: boolean;
}

const buttonClass = 'rounded-xl bg-amber-500 px-8 py-3 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60';

const UnclaimedSignIn: React.FC<Props> = ({ packId, lineStyle, buttonStyle, paper }) => {
  const { signIn, busy, error } = useGoogleSignIn();
  const claim = useLocalPackClaim(packId);

  const shownError = error ?? claim.failure;
  const errorClass = paper ? PAPER_ERROR_CLASS : 'text-red-300';
  const label = busy ? SU_SIGNING_IN : SU_SIGN_IN_GOOGLE;
  return (
    <div data-testid="qr-unclaimed" className="flex flex-col items-center gap-[3vh] text-center">
      <p className={paper ? 'text-stl-ink' : 'text-slate-100'} style={lineStyle}>{SU_UNCLAIMED_LINE}</p>
      {!isSupabaseConfigured() ? (
        <p role="alert" className={errorClass} style={lineStyle}>{SU_ERR_NOT_CONFIGURED}</p>
      ) : paper ? (
        <Pill testId="qr-signin" onClick={() => void signIn()} disabled={busy} label={label} />
      ) : (
        <button type="button" data-testid="qr-signin" onClick={() => void signIn()} disabled={busy}
          className={buttonClass} style={buttonStyle}>
          {label}
        </button>
      )}
      {shownError && <p role="alert" className={errorClass} style={lineStyle}>{shownError}</p>}
    </div>
  );
};

export default UnclaimedSignIn;
