/**
 * LandingNextStudy.tsx — "下次查经 Next study": the current pack · 下次查经
 *
 * Takes a pack id (today the sample pack; later a "current pack" setting)
 * and loads it through the same seam TV mode uses (packSource.loadPack →
 * public/packs/<id>.json?schema=N). Title, passage and date render in large
 * type with two CTAs: open the pack in TV mode, and reveal this pack's
 * sign-up QR + link (drawn from the pack id by SignupQr / signupRoute) — or
 * the demo line when the pack has no owning leader.
 * A failed load is a handled state, not an error: the block still renders
 * with the static pack link and a bilingual "暂无 · none yet" line.
 */
import React, { useEffect, useState } from 'react';
import { loadPack } from '../studypack/packSource';
import type { StudyPack } from '../studypack/packTypes';
import SignupQr from '../signup/SignupQr';
import { signupHash, currentSignupUrl } from '../signup/signupRoute';
import { SU_QR_BODY, SU_DEMO_LINE } from '../signup/signupStrings';
import { packHash } from './landingRoute';
import {
  NEXT_EYEBROW, NEXT_HEADING_ZH, NEXT_HEADING_EN, NEXT_DESC, NEXT_OPEN_CTA,
  NEXT_SIGNUP_CTA, NEXT_SIGNUP_CLOSE, NEXT_SIGNUP_LINK, NEXT_NONE_YET, NEXT_LOADING,
} from './landingStrings';
import { ArrowIcon } from './landingIcons';
import LandingSection from './LandingSection';

type PackState =
  | { status: 'loading' }
  | { status: 'ready'; pack: StudyPack }
  | { status: 'unavailable' };

/** Load the pack once; any failure becomes the explicit `unavailable` state. */
function usePackSummary(packId: string): PackState {
  const [state, setState] = useState<PackState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadPack(packId)
      .then(pack => { if (!cancelled) setState({ status: 'ready', pack }); })
      .catch(() => {
        // Handled, not swallowed: the block renders NEXT_NONE_YET and keeps the
        // static pack link, so a missing or malformed pack never breaks the landing.
        if (!cancelled) setState({ status: 'unavailable' });
      });
    return () => { cancelled = true; };
  }, [packId]);
  return state;
}

const PackSummary: React.FC<{ state: PackState }> = ({ state }) => {
  if (state.status === 'ready') {
    const { title, passageRef, date } = state.pack;
    return (
      <div data-testid="next-study-pack">
        <p className="ld-next-title font-serif-sc font-semibold text-slate-50">{title}</p>
        <p className="ld-next-ref mt-2 text-amber-300">{passageRef}</p>
        <p className="ld-body mt-1 text-slate-400">{date}</p>
      </div>
    );
  }
  const line = state.status === 'loading' ? NEXT_LOADING : NEXT_NONE_YET;
  return <p className="ld-next-ref text-slate-400" data-testid="next-study-empty">{line}</p>;
};

/** QR + link for an owned pack; the demo line when the pack has no leader (or is not loaded). */
const SignupPanel: React.FC<{ state: PackState }> = ({ state }) => {
  const pack = state.status === 'ready' ? state.pack : null;
  return (
    <div data-testid="next-study-signup" className="mx-auto mt-6 max-w-sm rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
      {pack?.leaderId ? (
        <>
          <SignupQr url={currentSignupUrl(pack.id)} size="16rem" className="mx-auto" pack={pack} />
          <p className="ld-body mt-4 font-serif-sc text-slate-100">{SU_QR_BODY}</p>
          <a href={signupHash(pack.id)} className="ld-body ld-setup-line inline-block text-amber-300 underline underline-offset-4 hover:text-amber-200">
            {NEXT_SIGNUP_LINK}
          </a>
        </>
      ) : (
        <p data-testid="next-study-demo" className="ld-body font-serif-sc text-slate-300">{SU_DEMO_LINE}</p>
      )}
    </div>
  );
};

const LandingNextStudy: React.FC<{ packId: string }> = ({ packId }) => {
  const state = usePackSummary(packId);
  const [signupOpen, setSignupOpen] = useState(false);
  return (
    <LandingSection
      id="next"
      eyebrow={NEXT_EYEBROW}
      headingZh={NEXT_HEADING_ZH}
      headingEn={NEXT_HEADING_EN}
      description={NEXT_DESC}
    >
      <PackSummary state={state} />
      <div className="mx-auto mt-8 flex max-w-xl flex-col gap-4 sm:flex-row">
        <a
          href={packHash(packId)}
          data-testid="next-study-open"
          className="ld-cta flex flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-500 px-6 font-semibold text-slate-950 hover:bg-amber-400"
        >
          <span>{NEXT_OPEN_CTA}</span>
          <ArrowIcon />
        </a>
        <button
          type="button"
          onClick={() => setSignupOpen(open => !open)}
          aria-expanded={signupOpen}
          data-testid="next-study-signup-toggle"
          className="ld-cta flex flex-1 items-center justify-center rounded-2xl border border-amber-400/70 px-6 font-semibold text-amber-300 hover:bg-amber-400/10"
        >
          {signupOpen ? NEXT_SIGNUP_CLOSE : NEXT_SIGNUP_CTA}
        </button>
      </div>
      {signupOpen && <SignupPanel state={state} />}
    </LandingSection>
  );
};

export default LandingNextStudy;
