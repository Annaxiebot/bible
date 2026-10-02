/**
 * SignupPage.tsx — "#/signup/<packId>" · 报名页
 *
 * The page a member lands on after scanning the TV QR. Loads the pack
 * through the same seam TV mode uses (packSource.loadPack: public packs and
 * this device's local- packs), shows its title + passage, then the two-step
 * form (commitment, then contact) — only for a pack with an owning leader.
 * An unclaimed local pack shows the sign-in block (the leader's own device);
 * a public demo pack shows the bilingual "no sign-up" line. Each row
 * carries the pack's leader_id so only that leader can read it (ADR-0004).
 * A stored row flips to the thank-you: the commitment restated, the
 * member's check-in link, and the welcome email's verdict.
 * Every failure (pack missing, service unconfigured, insert rejected) is a
 * visible state, never a silent catch.
 */
import React, { useEffect, useState } from 'react';
import { loadPack, packSignupState } from '../studypack/packSource';
import type { StudyPack } from '../studypack/packTypes';
import { useLocalPackClaim } from '../newstudy/claimLocalPacks';
import SignupForm from './SignupForm';
import UnclaimedSignIn from './UnclaimedSignIn';
import {
  SignupForm as SignupFormValues, getSignupClient, insertSignup, toInsertPayload, practiceLine,
} from './signupClient';
import { sendWelcome, WelcomeResult } from './welcomeEmail';
import { currentCheckinLink } from '../checkin/checkinLink';
import { CK_YOUR_LINK } from '../checkin/checkinStrings';
import {
  SU_TITLE, SU_INTRO, SU_PACK_LOADING, SU_ERR_PACK, SU_ERR_NOT_CONFIGURED, SU_THANKS, SU_NEXT, SU_NEXT_NO_CHECKINS,
  SU_DEMO_LINE, commitmentLine,
} from './signupStrings';
import { textStyle, headingStyle, pageTitleStyle, controlStyle } from '../newstudy/newStudyStyles';

type PackState =
  | { status: 'loading' }
  | { status: 'ready'; pack: StudyPack }
  | { status: 'failed'; message: string };

/** Load the pack once (again after a sign-in claims it); a failure is a rendered state carrying the message. */
function usePack(packId: string): PackState {
  const [state, setState] = useState<PackState>({ status: 'loading' });
  const claim = useLocalPackClaim(packId);
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadPack(packId)
      .then(pack => { if (!cancelled) setState({ status: 'ready', pack }); })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [packId, claim.version]);
  return state;
}

const PackHeader: React.FC<{ state: PackState }> = ({ state }) => {
  if (state.status === 'ready') {
    return (
      <div data-testid="signup-pack">
        <p className="font-semibold text-slate-50" style={headingStyle}>{state.pack.title}</p>
        <p className="mt-1 text-amber-300" style={textStyle}>{state.pack.passageRef}</p>
      </div>
    );
  }
  if (state.status === 'failed') {
    return <p role="alert" className="text-red-300" style={textStyle}>{SU_ERR_PACK}: {state.message}</p>;
  }
  return <p className="text-slate-400" style={textStyle}>{SU_PACK_LOADING}</p>;
};

export interface SignupDone {
  consent: boolean;
  practice: string;
  link: string;
  welcome: WelcomeResult;
}

const Thanks: React.FC<{ done: SignupDone }> = ({ done }) => (
  <div data-testid="signup-thanks" className="rounded-2xl border border-amber-400/60 bg-slate-900 p-6">
    <p className="font-bold text-amber-300" style={headingStyle}>{SU_THANKS}</p>
    <p data-testid="signup-commitment" className="mt-3 text-slate-50" style={textStyle}>{commitmentLine(done.practice)}</p>
    <p className="mt-3 text-slate-100" style={textStyle}>{done.consent ? SU_NEXT : SU_NEXT_NO_CHECKINS}</p>
    <p className="mt-3 text-slate-400" style={textStyle}>{CK_YOUR_LINK}</p>
    <a data-testid="signup-checkin-link" href={done.link} className="break-all text-amber-300 underline underline-offset-4" style={textStyle}>
      {done.link}
    </a>
    {done.welcome.status === 'failed' && (
      <p role="alert" data-testid="welcome-failed" className="mt-3 text-red-300" style={textStyle}>{done.welcome.message}</p>
    )}
  </div>
);

/** Form for an owned pack; sign-in block for an unclaimed local pack; the demo line for a public demo pack. */
const Body: React.FC<{ state: PackState; done: SignupDone | null; onSubmit: (f: SignupFormValues) => Promise<void> }> =
  ({ state, done, onSubmit }) => {
    if (state.status !== 'ready') return null;
    const signup = packSignupState(state.pack);
    if (signup === 'unclaimed') return <UnclaimedSignIn packId={state.pack.id} lineStyle={textStyle} buttonStyle={controlStyle} />;
    if (signup === 'demo') return <p data-testid="signup-demo" className="text-slate-300" style={textStyle}>{SU_DEMO_LINE}</p>;
    const rows = state.pack.sections.find(s => s.kind === 'lifeMenu')?.rows ?? [];
    return done ? <Thanks done={done} /> : <SignupForm rows={rows} onSubmit={onSubmit} />;
  };

const SignupPage: React.FC<{ packId: string }> = ({ packId }) => {
  const state = usePack(packId);
  const [done, setDone] = useState<SignupDone | null>(null);

  const submit = async (form: SignupFormValues) => {
    if (state.status !== 'ready') return;
    const client = getSignupClient();
    if (!client) throw new Error(SU_ERR_NOT_CONFIGURED);
    const payload = toInsertPayload(state.pack, form);
    const signupId = await insertSignup(client, payload);
    const practice = practiceLine(form);
    const link = currentCheckinLink({ pack: state.pack, signupId, name: payload.name, practice });
    const welcome = await sendWelcome(client, signupId, payload.email);
    setDone({ consent: form.consent, practice, link, welcome });
  };

  return (
    <div data-testid="signup-page" className="fixed inset-0 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="font-bold text-amber-300" style={pageTitleStyle}>{SU_TITLE}</h1>
          <p className="mt-2 text-slate-400" style={textStyle}>{SU_INTRO}</p>
        </header>
        <PackHeader state={state} />
        <Body state={state} done={done} onSubmit={submit} />
      </div>
    </div>
  );
};

export default SignupPage;
