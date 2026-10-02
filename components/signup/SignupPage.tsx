/**
 * SignupPage.tsx — "#/signup/<packId>" · 报名页
 *
 * The page a member lands on after scanning the TV QR. Loads the pack
 * through the same seam TV mode uses (packSource.loadPack: public packs and
 * this device's local- packs), shows its title + passage, then the form —
 * only for a pack with an owning leader (leaderId); a demo pack shows the
 * bilingual "no sign-up" line. Each row carries the pack's leader_id so only
 * that leader can read it (ADR-0004). A stored row flips to the bilingual
 * thank-you with what happens next.
 * Every failure (pack missing, service unconfigured, insert rejected) is a
 * visible state, never a silent catch.
 */
import React, { useEffect, useState } from 'react';
import { loadPack } from '../studypack/packSource';
import type { StudyPack } from '../studypack/packTypes';
import SignupForm from './SignupForm';
import { SignupForm as SignupFormValues, getSignupClient, insertSignup, toInsertPayload } from './signupClient';
import {
  SU_TITLE, SU_INTRO, SU_PACK_LOADING, SU_ERR_PACK, SU_ERR_NOT_CONFIGURED, SU_THANKS, SU_NEXT, SU_NEXT_NO_CHECKINS,
  SU_DEMO_LINE,
} from './signupStrings';
import { textStyle, headingStyle, pageTitleStyle } from '../newstudy/newStudyStyles';

type PackState =
  | { status: 'loading' }
  | { status: 'ready'; pack: StudyPack }
  | { status: 'failed'; message: string };

/** Load the pack once; a failure is a rendered state carrying the message. */
function usePack(packId: string): PackState {
  const [state, setState] = useState<PackState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadPack(packId)
      .then(pack => { if (!cancelled) setState({ status: 'ready', pack }); })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [packId]);
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

const Thanks: React.FC<{ consent: boolean }> = ({ consent }) => (
  <div data-testid="signup-thanks" className="rounded-2xl border border-amber-400/60 bg-slate-900 p-6">
    <p className="font-bold text-amber-300" style={headingStyle}>{SU_THANKS}</p>
    <p className="mt-3 text-slate-100" style={textStyle}>{consent ? SU_NEXT : SU_NEXT_NO_CHECKINS}</p>
  </div>
);

/** Form only for an owned pack (leaderId); a demo pack shows the bilingual no-sign-up line. */
const Body: React.FC<{ state: PackState; done: { consent: boolean } | null; onSubmit: (f: SignupFormValues) => Promise<void> }> =
  ({ state, done, onSubmit }) => {
    if (state.status !== 'ready') return null;
    if (!state.pack.leaderId) return <p data-testid="signup-demo" className="text-slate-300" style={textStyle}>{SU_DEMO_LINE}</p>;
    return done ? <Thanks consent={done.consent} /> : <SignupForm onSubmit={onSubmit} />;
  };

const SignupPage: React.FC<{ packId: string }> = ({ packId }) => {
  const state = usePack(packId);
  const [done, setDone] = useState<{ consent: boolean } | null>(null);

  const submit = async (form: SignupFormValues) => {
    if (state.status !== 'ready') return;
    const client = getSignupClient();
    if (!client) throw new Error(SU_ERR_NOT_CONFIGURED);
    await insertSignup(client, toInsertPayload(state.pack, form));
    setDone({ consent: form.consent });
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
