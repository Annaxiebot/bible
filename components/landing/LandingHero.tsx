/**
 * LandingHero.tsx — headline over concentric rings · 首页主视觉
 *
 * Paper hero, style "醒目 Bold": a mono eyebrow, the "Scripture to Life"
 * line, the 活出神的话 headline (霞鹜文楷, 神的话 in the deep-gold gradient),
 * the bilingual sub-line, two gold pills (the sample pack; 新建查经) and the
 * loop line. Behind it, static rings plus four gold waves that ripple out
 * (CSS only, landing.css); the waves are hidden under prefers-reduced-motion
 * and the page reads the same without them (ADR-0003 §16).
 */
import React from 'react';
import { SAMPLE_PACK_HASH, NEW_STUDY_HASH } from './landingRoute';
import {
  BRAND_EN, BRAND_ZH_LEAD, BRAND_ZH_HIGHLIGHT, HERO_EYEBROW, HERO_SUB_ZH, HERO_SUB_EN,
  GROUP_CTA, NEW_STUDY_LINE, LOOP_LINE_ZH,
} from './landingStrings';
import Pill from '../shared/Pill';

const CENTER = 750;
const STATIC_RADII = [140, 210, 290, 380, 480, 590, 710] as const;
const WAVE_COUNT = 4;
const WAVE_RADIUS = 740;
const CJK_DASH = '——';

const Rings: React.FC = () => (
  <svg className="ld-rings" viewBox="0 0 1500 1500" aria-hidden="true" data-testid="hero-rings">
    <g className="ld-rings-static">
      {STATIC_RADII.map(r => <circle key={r} cx={CENTER} cy={CENTER} r={r} />)}
    </g>
    <g className="ld-rings-wave">
      {Array.from({ length: WAVE_COUNT }, (_, i) => <circle key={i} cx={CENTER} cy={CENTER} r={WAVE_RADIUS} />)}
    </g>
  </svg>
);

/** The Chinese sub-line with its —— drawn by a CJK face (Inter leaves a gap in it). */
const SubZh: React.FC = () => {
  const [before, after] = HERO_SUB_ZH.split(CJK_DASH);
  return (
    <span className="ld-sub-zh">
      {before}{after !== undefined && <><span className="ld-cjk">{CJK_DASH}</span>{after}</>}
    </span>
  );
};

const LandingHero: React.FC = () => (
  <section className="ld-hero" aria-labelledby="hero-h" data-testid="landing-hero">
    <Rings />
    <div className="ld-wrap">
      <p className="ld-eyebrow">{HERO_EYEBROW}</p>
      <p className="ld-brand-line">{BRAND_EN}</p>
      <h1 id="hero-h" className="ld-headline" data-testid="hero-headline">
        {BRAND_ZH_LEAD}<span className="ld-hl">{BRAND_ZH_HIGHLIGHT}</span>
      </h1>
      <p className="ld-sub">
        <SubZh />
        <span className="ld-en">{HERO_SUB_EN}</span>
      </p>
      <div className="ld-ctas">
        <Pill href={SAMPLE_PACK_HASH} label={GROUP_CTA} arrow testId="hero-sample" />
        <Pill href={NEW_STUDY_HASH} label={NEW_STUDY_LINE} ghost testId="hero-new-study" />
      </div>
      <p className="ld-loop-line">{LOOP_LINE_ZH}</p>
    </div>
  </section>
);

export default LandingHero;
