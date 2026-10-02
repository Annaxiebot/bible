/**
 * Landing.tsx — scripturetolife.org home page · 首頁
 *
 * Minimalist, mobile-first, dark (slate-950/amber, matching TV mode), with
 * large type for adults and seniors. Shown only at the bare root URL; the
 * two door-card CTAs set the hash that LandingGate routes on. Static
 * content — no data fetching. Strings live in landingStrings.ts (ADR-0003:
 * Chinese first, English second). The hero background theme is chosen once
 * per session (heroThemeSession.ts).
 */
import React, { useState } from 'react';
import './landing.css';
import LandingSky from './LandingSky';
import LandingHero from './LandingHero';
import LandingCards from './LandingCards';
import { resolveSessionThemeFromWindow } from './heroThemeSession';
import { LEADER_ZH, LEADER_EN, SITE_LINE, LOOP_LINE_ZH, LOOP_LINE_EN } from './landingStrings';

const LeaderLine: React.FC = () => (
  <p className="ld-body mx-auto mt-12 max-w-2xl text-center text-slate-400">
    <span className="block font-serif-sc text-slate-300">{LEADER_ZH}</span>
    <span className="block">{LEADER_EN}</span>
  </p>
);

const Footer: React.FC = () => (
  <footer className="ld-footer mt-16 border-t border-slate-800/80 pb-12 pt-8 text-center text-slate-400">
    <p>{SITE_LINE}</p>
    <p className="mt-2">
      <span className="font-serif-sc">{LOOP_LINE_ZH}</span>
      <span className="mx-2 text-slate-600">·</span>
      <span>{LOOP_LINE_EN}</span>
    </p>
  </footer>
);

const Landing: React.FC = () => {
  const [theme] = useState(resolveSessionThemeFromWindow);
  return (
    <div
      data-testid="landing-page"
      className="ld-root fixed inset-0 overflow-y-auto bg-slate-950 text-slate-100"
    >
      <LandingSky theme={theme} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <LandingHero theme={theme} />
        <LandingCards />
        <LeaderLine />
        <Footer />
      </div>
    </div>
  );
};

export default Landing;
