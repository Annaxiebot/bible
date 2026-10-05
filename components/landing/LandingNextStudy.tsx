/**
 * LandingNextStudy.tsx — "下次查经 Next study": the current pack · 下次查经
 *
 * Takes a pack id (today the sample pack; later a "current pack" setting)
 * and loads it through the same seam TV mode uses (packSource.loadPack →
 * public/packs/<id>.json?schema=N). A card shows title, passage and date
 * with two pills: open the pack in TV mode, and reveal this pack's sign-up
 * QR + link (drawn from the pack id by SignupQr / signupRoute) — or the
 * demo line when the pack has no owning leader. Beside it, a dark panel
 * quotes the key verse from the bundled data. `children` (the New study
 * block and the AI line, owned by Landing) render under the card.
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
  NEXT_SECTION_ID, NEXT_EYEBROW, NEXT_HEADING_ZH, NEXT_HEADING_EN, NEXT_DESC, NEXT_OPEN_CTA,
  NEXT_SIGNUP_CTA, NEXT_SIGNUP_CLOSE, NEXT_SIGNUP_LINK, NEXT_NONE_YET, NEXT_LOADING, NEXT_VERSE_REF,
} from './landingStrings';
import { TRANSLATIONS } from '../studypack/principles';
import LandingSection, { splitBilingual } from './LandingSection';
import Pill from '../shared/Pill';
import { useBundledVerse, BilingualRef } from './LandingVerse';

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
    const at = title.indexOf(' ');
    const ref = splitBilingual(passageRef);
    return (
      <div data-testid="next-study-pack">
        <p className="ld-next-title">
          {at < 0 ? title : <>{title.slice(0, at)}{' '}<span className="ld-h2-en">{title.slice(at + 1)}</span></>}
        </p>
        <p className="ld-next-ref"><b className="ld-hl">{ref.zh}</b>{ref.en && ` · ${ref.en}`}</p>
        <p className="ld-next-date">{date}</p>
      </div>
    );
  }
  const line = state.status === 'loading' ? NEXT_LOADING : NEXT_NONE_YET;
  return <p className="ld-next-ref" data-testid="next-study-empty">{line}</p>;
};

/** QR + link for an owned pack; the demo line when the pack has no leader (or is not loaded). */
const SignupPanel: React.FC<{ state: PackState }> = ({ state }) => {
  const pack = state.status === 'ready' ? state.pack : null;
  return (
    <div data-testid="next-study-signup" className="ld-signup-panel">
      {pack?.leaderId ? (
        <>
          <SignupQr url={currentSignupUrl(pack.id)} size="16rem" pack={pack} />
          <p className="mt-4">{SU_QR_BODY}</p>
          <a href={signupHash(pack.id)} className="ld-text-link">{NEXT_SIGNUP_LINK}</a>
        </>
      ) : (
        <p data-testid="next-study-demo">{SU_DEMO_LINE}</p>
      )}
    </div>
  );
};

const KeyVerse: React.FC = () => {
  const verse = useBundledVerse(NEXT_VERSE_REF.zh);
  return (
    <blockquote className="ld-next-verse" data-testid="next-study-verse">
      <p className="ld-q">{verse?.cuv}</p>
      <p className="ld-q-en" lang="en">{verse?.en}</p>
      <div className="ld-ref">
        <BilingualRef refs={NEXT_VERSE_REF} suffix={` · ${TRANSLATIONS.zh.label} | ${TRANSLATIONS.en.label}`} />
      </div>
    </blockquote>
  );
};

const LandingNextStudy: React.FC<{ packId: string; children?: React.ReactNode }> = ({ packId, children }) => {
  const state = usePackSummary(packId);
  const [signupOpen, setSignupOpen] = useState(false);
  return (
    <LandingSection
      id={NEXT_SECTION_ID} tone="tint" eyebrow={NEXT_EYEBROW}
      headingZh={NEXT_HEADING_ZH} headingEn={NEXT_HEADING_EN} description={NEXT_DESC}
    >
      <div className="ld-next-card">
        <div className="ld-next-main">
          <PackSummary state={state} />
          <div className="ld-next-ctas">
            <Pill href={packHash(packId)} label={NEXT_OPEN_CTA} arrow testId="next-study-open" />
            <Pill ghost onClick={() => setSignupOpen(open => !open)} expanded={signupOpen}
              testId="next-study-signup-toggle" label={signupOpen ? NEXT_SIGNUP_CLOSE : NEXT_SIGNUP_CTA} />
          </div>
          {signupOpen && <SignupPanel state={state} />}
        </div>
        <KeyVerse />
      </div>
      {children}
    </LandingSection>
  );
};

export default LandingNextStudy;
