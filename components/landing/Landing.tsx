/**
 * Landing.tsx — scripturetolife.org home page · 首页
 *
 * Style "醒目 Bold" (approved mockup, 2026-10): a light paper page with
 * dark bands, 霞鹜文楷 headings and Inter body text, gold pills, large type
 * for adults and seniors (tokens: styles/stlTheme.css; layout: landing.css
 * + landingSections.css). Shown only at the bare root URL. Order: sticky
 * nav · hero · the loop (01 02 03) · group band (photos) · personal study ·
 * next study (+ 新建查经 and the AI line) · honest numbers · footer (its
 * links end with 意见反馈 · Feedback → #/feedback?from=landing, ADR-0011).
 * Strings live in landingStrings.ts (ADR-0003: Chinese first). The AI
 * line (and the #/setup hash) opens the AI service dialog. The next-study
 * block takes a pack id so a later "current pack" setting can drive it;
 * today it is the sample pack.
 */
import React, { useState, useEffect, useCallback } from 'react';
import './landing.css';
import './landingSections.css';
import LandingNav, { SectionLink } from './LandingNav';
import LandingHero from './LandingHero';
import LandingCards from './LandingCards';
import LandingGroup from './LandingGroup';
import LandingPersonal from './LandingPersonal';
import LandingNextStudy from './LandingNextStudy';
import LandingNumbers from './LandingNumbers';
import Pill from '../shared/Pill';
import { splitLabel } from '../studypack/principles';
import { SETUP_HASH, NEW_STUDY_HASH, SAMPLE_PACK_ID } from './landingRoute';
import {
  SITE_LINE, LOOP_LINE_ZH, LOOP_LINE_EN, SETUP_LINE, SETUP_DONE_LINE, NEW_STUDY_LINE, NEW_STUDY_SUB,
  BRAND_EN, BRAND_ZH_LEAD, BRAND_ZH_HIGHLIGHT, NAV_LINKS, PHOTO_CREDIT,
} from './landingStrings';
import { FEEDBACK_LABEL, feedbackHash } from '../../supabase/functions/_shared/feedback';
import { useAIAccess } from '../setup/useAIAccess';
import QuickAISetupDialog from '../setup/QuickAISetup';

/** Third door: "新建查经 New study" → #/new, with its one-line description. */
const NewStudyBlock: React.FC = () => {
  const { zh, en } = splitLabel(NEW_STUDY_LINE);
  return (
    <div className="ld-new-study">
      <div>
        <div className="ld-new-study-t">{zh} <span className="ld-new-study-en">{en}</span></div>
        <div className="ld-new-study-s">{NEW_STUDY_SUB}</div>
      </div>
      <Pill ghost href={NEW_STUDY_HASH} label={NEW_STUDY_LINE} testId="landing-new-study-line" />
    </div>
  );
};

const SetupLine: React.FC<{ configured: boolean; onOpen: () => void }> = ({ configured, onOpen }) => (
  <p className="ld-ai-line">
    <button type="button" onClick={onOpen} data-testid="landing-setup-line">
      {configured ? SETUP_DONE_LINE : SETUP_LINE}
    </button>
  </p>
);

const Footer: React.FC = () => {
  const newStudy = splitLabel(NEW_STUDY_LINE);
  const [feedbackZh, feedbackEn] = FEEDBACK_LABEL.split(' · ');
  return (
    <footer className="ld-footer ld-dark" data-testid="landing-footer">
      <div className="ld-wrap">
        <div className="ld-foot-grid">
          <div>
            <div className="ld-foot-brand" aria-hidden="true">{BRAND_ZH_LEAD}<span className="ld-hl">{BRAND_ZH_HIGHLIGHT}</span></div>
            <div className="ld-foot-en">{BRAND_EN}</div>
            <div className="ld-foot-loop">{LOOP_LINE_ZH}<br />{LOOP_LINE_EN}</div>
          </div>
          <div className="ld-foot-links">
            {NAV_LINKS.map(link => <SectionLink key={link.id} link={link} className="ld-foot-link" />)}
            <a className="ld-foot-link" href={NEW_STUDY_HASH}>
              {newStudy.zh}<span className="ld-nav-en">{newStudy.en}</span>
            </a>
            <a className="ld-foot-link" href={feedbackHash('landing')} data-testid="landing-feedback-link">
              {feedbackZh}<span className="ld-nav-en">{feedbackEn}</span>
            </a>
          </div>
        </div>
        <div className="ld-foot-bottom">
          <p>{SITE_LINE}</p>
          <p data-testid="photo-credit">{PHOTO_CREDIT}</p>
        </div>
      </div>
    </footer>
  );
};

const Landing: React.FC<{ setupOpen?: boolean }> = ({ setupOpen = false }) => {
  const [open, setOpen] = useState(setupOpen);
  const ai = useAIAccess();
  useEffect(() => { setOpen(setupOpen); }, [setupOpen]);

  const close = useCallback(() => {
    setOpen(false);
    // Clear the direct-link hash so a reload shows the plain landing, not the dialog.
    if (window.location.hash === SETUP_HASH) window.location.hash = '';
  }, []);

  return (
    <div data-testid="landing-page" className="ld-root" lang="zh-Hans">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingCards />
        <LandingGroup />
        <LandingPersonal />
        <LandingNextStudy packId={SAMPLE_PACK_ID}>
          <NewStudyBlock />
          <SetupLine configured={ai.available} onOpen={() => setOpen(true)} />
        </LandingNextStudy>
        <LandingNumbers />
      </main>
      <Footer />
      <QuickAISetupDialog open={open} onClose={close} onSaved={ai.refresh} />
    </div>
  );
};

export default Landing;
