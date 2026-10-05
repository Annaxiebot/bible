/**
 * SignupPage.tsx — "#/signup/<packId>" · 报名页
 *
 * The page a member lands on after scanning the TV QR. Loads the pack
 * through signupPack.loadSignupPack (TV mode's packSource first; for a
 * leader pack this phone does not hold, the anon public_signup_pack
 * projection — title, passage, leader, life menu, form link only), shows
 * its title + passage, then the two-step
 * form (commitment, then contact) — only for a pack with an owning leader.
 * An unclaimed local pack shows the sign-in block (the leader's own device);
 * a public demo pack shows the bilingual "no sign-up" line. Each row
 * carries the pack's leader_id so only that leader can read it (ADR-0004).
 * A stored row flips to the thank-you: every chosen practice restated, the
 * member's check-in link, the welcome email's verdict, and — when this
 * sign-up replaced the member's earlier one (same pack + email) — a line
 * saying so (a failed replace is shown, never swallowed).
 * Every failure (pack missing, service unconfigured, insert rejected) is a
 * visible state, never a silent catch. Paper style like the landing
 * (shared/paperStyles.ts): WenKai headings, sans body, gold pills.
 */
import React, { useState } from 'react';
import { packSignupState } from '../studypack/packSource';
import { useSignupPack, SignupPackState } from './useSignupPack';
import SignupForm from './SignupForm';
import UnclaimedSignIn from './UnclaimedSignIn';
import {
  SignupForm as SignupFormValues, getSignupClient, insertSignup, toInsertPayload, practiceLines, ownVersionOf, markReplaced, ReplaceResult,
} from './signupClient';
import { sendWelcome, WelcomeResult } from './welcomeEmail';
import { currentCheckinLink } from '../checkin/checkinLink';
import { CK_YOUR_LINK } from '../checkin/checkinStrings';
import {
  SU_TITLE, SU_INTRO, SU_PACK_LOADING, SU_ERR_PACK, SU_ERR_NOT_CONFIGURED, SU_THANKS, SU_NEXT, SU_NEXT_NO_CHECKINS,
  SU_DEMO_LINE, SU_REPLACED, commitmentLine,
} from './signupStrings';
import { textStyle, headingStyle, pageTitleStyle, controlStyle } from '../newstudy/newStudyStyles';
import {
  PAPER_PAGE_CLASS, PAPER_COLUMN_CLASS, PAPER_HEAD_CLASS, PAPER_MUTED_CLASS, PAPER_ACCENT_CLASS, PAPER_ERROR_CLASS, PAPER_CARD_CLASS,
} from '../shared/paperStyles';

const PackHeader: React.FC<{ state: SignupPackState }> = ({ state }) => {
  if (state.status === 'ready') {
    return (
      <div data-testid="signup-pack">
        <p className={PAPER_HEAD_CLASS} style={headingStyle}>{state.pack.title}</p>
        <p className={`mt-1 font-semibold ${PAPER_ACCENT_CLASS}`} style={textStyle}>{state.pack.passageRef}</p>
      </div>
    );
  }
  if (state.status === 'failed') {
    return <p role="alert" className={PAPER_ERROR_CLASS} style={textStyle}>{SU_ERR_PACK}: {state.message}</p>;
  }
  return <p className={PAPER_MUTED_CLASS} style={textStyle}>{SU_PACK_LOADING}</p>;
};

export interface SignupDone {
  consent: boolean;
  practices: string[];
  ownVersion: string | null;
  link: string;
  welcome: WelcomeResult;
  replace: ReplaceResult;
}

const Thanks: React.FC<{ done: SignupDone }> = ({ done }) => (
  <div data-testid="signup-thanks" className={PAPER_CARD_CLASS}>
    <p className={PAPER_HEAD_CLASS} style={headingStyle}>{SU_THANKS}</p>
    {done.practices.map((line, i) => (
      <p key={i} data-testid="signup-commitment" className={`mt-3 ${PAPER_ACCENT_CLASS}`} style={textStyle}>{commitmentLine(line)}</p>
    ))}
    {done.ownVersion && <p data-testid="signup-own-version" className={`mt-3 ${PAPER_ACCENT_CLASS}`} style={textStyle}>{done.ownVersion}</p>}
    {done.replace.status === 'done' && done.replace.replaced > 0 && (
      <p data-testid="signup-replaced" className="mt-3" style={textStyle}>{SU_REPLACED}</p>
    )}
    <p className="mt-3" style={textStyle}>{done.consent ? SU_NEXT : SU_NEXT_NO_CHECKINS}</p>
    <p className={`mt-3 ${PAPER_MUTED_CLASS}`} style={textStyle}>{CK_YOUR_LINK}</p>
    <a data-testid="signup-checkin-link" href={done.link} className={`break-all underline underline-offset-4 ${PAPER_ACCENT_CLASS}`} style={textStyle}>
      {done.link}
    </a>
    {done.replace.status === 'failed' && (
      <p role="alert" data-testid="replace-failed" className={`mt-3 ${PAPER_ERROR_CLASS}`} style={textStyle}>{done.replace.message}</p>
    )}
    {done.welcome.status === 'failed' && (
      <p role="alert" data-testid="welcome-failed" className={`mt-3 ${PAPER_ERROR_CLASS}`} style={textStyle}>{done.welcome.message}</p>
    )}
  </div>
);

/** Form for an owned pack; sign-in block for an unclaimed local pack; the demo line for a public demo pack. */
const Body: React.FC<{ state: SignupPackState; done: SignupDone | null; onSubmit: (f: SignupFormValues) => Promise<void> }> =
  ({ state, done, onSubmit }) => {
    if (state.status !== 'ready') return null;
    const signup = packSignupState(state.pack);
    if (signup === 'unclaimed') return <UnclaimedSignIn packId={state.pack.id} lineStyle={textStyle} buttonStyle={controlStyle} paper />;
    if (signup === 'demo') return <p data-testid="signup-demo" style={textStyle}>{SU_DEMO_LINE}</p>;
    return done ? <Thanks done={done} /> : <SignupForm rows={state.pack.lifeMenu} onSubmit={onSubmit} />;
  };

const SignupPage: React.FC<{ packId: string }> = ({ packId }) => {
  const state = useSignupPack(packId);
  const [done, setDone] = useState<SignupDone | null>(null);

  const submit = async (form: SignupFormValues) => {
    if (state.status !== 'ready') return;
    const client = getSignupClient();
    if (!client) throw new Error(SU_ERR_NOT_CONFIGURED);
    const payload = toInsertPayload(state.pack, form);
    const signupId = await insertSignup(client, payload);
    const practices = practiceLines(form);
    // The Google Form prefill carries the first practice (same as the edge function's feedbackUrl).
    const link = currentCheckinLink({ pack: state.pack, signupId, name: payload.name, practice: practices[0] ?? '' });
    const replace = await markReplaced(client, signupId);
    const welcome = await sendWelcome(client, signupId, payload.email);
    setDone({ consent: form.consent, practices, ownVersion: ownVersionOf(form), link, welcome, replace });
  };

  return (
    <div data-testid="signup-page" className={PAPER_PAGE_CLASS}>
      <div className={PAPER_COLUMN_CLASS}>
        <header>
          <h1 className={PAPER_HEAD_CLASS} style={pageTitleStyle}>{SU_TITLE}</h1>
          <p className={`mt-2 ${PAPER_MUTED_CLASS}`} style={textStyle}>{SU_INTRO}</p>
        </header>
        <PackHeader state={state} />
        <Body state={state} done={done} onSubmit={submit} />
      </div>
    </div>
  );
};

export default SignupPage;
