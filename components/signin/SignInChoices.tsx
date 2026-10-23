/**
 * SignInChoices.tsx — "用 Google 登录" and "用邮箱登录" side by side · 登录方式 (ADR-0020)
 *
 * The one shared sign-in block (R3) for the AI service form (New study, the
 * TV Ask-AI overlay, #/setup) and the leader home: the identity-only Google
 * button (useGoogleSignIn) when Supabase is configured, and beside it the
 * quieter email choice that opens the email steps below (EmailSignInSteps).
 * `returnTo` as for Google: omitted → back to the page the sign-in started on.
 * A failed Google start renders as a red line (never swallowed).
 */
import React from 'react';
import { isSupabaseConfigured } from '../../services/supabase';
import { useGoogleSignIn } from '../signup/useGoogleSignIn';
import { SU_SIGN_IN_GOOGLE, SU_SIGNING_IN } from '../signup/signupStrings';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../setup/setupStrings';
import { useEmailSignIn } from './useEmailSignIn';
import { emailSignInAvailable } from './emailAuth';
import { EmailSignInSteps } from './EmailSignIn';
import { SI_EMAIL_TOGGLE } from './signInStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };

export interface SignInChoicesProps {
  returnTo?: string;
  /** Test id of the Google button (pages keep their existing ids). */
  googleTestId?: string;
}

export const SignInChoices: React.FC<SignInChoicesProps> = ({ returnTo, googleTestId = 'google-sign-in' }) => {
  const google = useGoogleSignIn(returnTo);
  const email = useEmailSignIn(returnTo);
  const withGoogle = isSupabaseConfigured();
  const withEmail = emailSignInAvailable();
  return (
    <div data-testid="sign-in-choices" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {withGoogle && (
          <button type="button" data-testid={googleTestId} onClick={() => void google.signIn()} disabled={google.busy}
            className="rounded-lg bg-stl-gold px-5 font-semibold text-stl-bg hover:bg-stl-gold-hover disabled:opacity-60" style={controlStyle}>
            {google.busy ? SU_SIGNING_IN : SU_SIGN_IN_GOOGLE}
          </button>
        )}
        {withEmail && email.step === 'closed' && (
          <button type="button" data-testid="email-sign-in-open" onClick={email.open}
            className="rounded-lg border border-stl-border px-5 text-stl-text hover:border-stl-gold" style={controlStyle}>
            {SI_EMAIL_TOGGLE}
          </button>
        )}
      </div>
      {google.error && <p role="alert" className="text-red-300" style={textStyle}>{google.error}</p>}
      {withEmail && <EmailSignInSteps s={email} />}
    </div>
  );
};

export default SignInChoices;
