/**
 * Landing.tsx — scripturetolife.org home page · 首页
 *
 * Minimalist, mobile-first, dark (charcoal/muted gold tokens in styles/stlTheme.css, matching TV mode), with
 * large type for adults and seniors. Shown only at the bare root URL; the
 * two door-card CTAs set the hash that LandingGate routes on. Static
 * content except the next-study block's pack fetch. Strings live in landingStrings.ts (ADR-0003:
 * Chinese first, English second). The hero background theme is chosen once
 * per session (heroThemeSession.ts). A one-line entry under the cards (and
 * the #/setup hash) opens the quick AI key dialog. Below the cards, two
 * sections (next study · honest numbers) share one shell
 * (LandingSection); a sticky two-link nav scrolls to the cards.
 * The next-study block takes a pack id so a later "current
 * pack" setting can drive it; today it is the sample pack.
 */
import React, { useState, useEffect, useCallback } from 'react';
import './landing.css';
import LandingSky from './LandingSky';
import LandingHero from './LandingHero';
import LandingCards from './LandingCards';
import LandingNav from './LandingNav';
import LandingNextStudy from './LandingNextStudy';
import LandingNumbers from './LandingNumbers';
import { resolveSessionThemeFromWindow } from './heroThemeSession';
import { SETUP_HASH, NEW_STUDY_HASH, SAMPLE_PACK_ID } from './landingRoute';
import {
  LEADER_ZH, LEADER_EN, SITE_LINE, LOOP_LINE_ZH, LOOP_LINE_EN, SETUP_LINE, SETUP_DONE_LINE,
  NEW_STUDY_LINE, NEW_STUDY_SUB,
} from './landingStrings';
import { useAIAccess } from '../setup/useAIAccess';
import QuickAISetupDialog from '../setup/QuickAISetup';

const LeaderLine: React.FC = () => (
  <p className="ld-body mx-auto mt-12 max-w-2xl text-center text-stl-text-2" data-testid="leader-line">
    <span className="block font-serif-sc text-stl-text">{LEADER_ZH}</span>
    <span className="block">{LEADER_EN}</span>
  </p>
);

const SetupLine: React.FC<{ configured: boolean; onOpen: () => void }> = ({ configured, onOpen }) => (
  <p className="mt-8 text-center">
    <button
      type="button"
      onClick={onOpen}
      data-testid="landing-setup-line"
      className="ld-body ld-setup-line text-stl-gold underline underline-offset-4 hover:text-stl-gold-hover"
    >
      {configured ? SETUP_DONE_LINE : SETUP_LINE}
    </button>
  </p>
);

/** Third door: "新建查经 New study" → #/new (≥48px tap target via .ld-setup-line). */
const NewStudyLine: React.FC = () => (
  <p className="mt-6 text-center">
    <a
      href={NEW_STUDY_HASH}
      data-testid="landing-new-study-line"
      className="ld-body ld-setup-line inline-block text-stl-gold underline underline-offset-4 hover:text-stl-gold-hover"
    >
      {NEW_STUDY_LINE}
    </a>
    <span className="ld-body block text-stl-text-2">{NEW_STUDY_SUB}</span>
  </p>
);

const Footer: React.FC = () => (
  <footer className="ld-footer mt-16 border-t border-stl-border pb-12 pt-8 text-center text-stl-text-2">
    <p>{SITE_LINE}</p>
    <p className="mt-2">
      <span className="font-serif-sc">{LOOP_LINE_ZH}</span>
      <span className="mx-2 text-stl-text-3">·</span>
      <span>{LOOP_LINE_EN}</span>
    </p>
  </footer>
);

const Landing: React.FC<{ setupOpen?: boolean }> = ({ setupOpen = false }) => {
  const [theme] = useState(resolveSessionThemeFromWindow);
  const [open, setOpen] = useState(setupOpen);
  const ai = useAIAccess();
  useEffect(() => { setOpen(setupOpen); }, [setupOpen]);

  const close = useCallback(() => {
    setOpen(false);
    // Clear the direct-link hash so a reload shows the plain landing, not the dialog.
    if (window.location.hash === SETUP_HASH) window.location.hash = '';
  }, []);

  return (
    <div data-testid="landing-page" className="ld-root bg-stl-bg text-stl-text">
      <LandingSky theme={theme} />
      <LandingNav />
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <LandingHero theme={theme} />
        <LandingCards />
        <SetupLine configured={ai.available} onOpen={() => setOpen(true)} />
        <NewStudyLine />
        <LeaderLine />
        <LandingNextStudy packId={SAMPLE_PACK_ID} />
        <LandingNumbers />
        <Footer />
      </div>
      <QuickAISetupDialog open={open} onClose={close} onSaved={ai.refresh} />
    </div>
  );
};

export default Landing;
