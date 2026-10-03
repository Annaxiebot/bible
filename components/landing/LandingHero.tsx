/**
 * LandingHero.tsx — wordmark, animated loop diagram, sub-line · 首页主视觉
 *
 * The three-step loop is an inline SVG: three nodes that light up in
 * sequence while an amber glow travels along the arrows (CSS-only, see
 * landing.css). Labels sit in an HTML grid beneath so they stay readable
 * and scale with zoom. Static under prefers-reduced-motion.
 */
import React from 'react';
import type { HeroTheme } from './heroThemes';
import { findVerseRefs } from '../studypack/verseRefs';
import { planExternalRef } from '../studypack/externalVerses';
import { bilingualRefLabel } from '../studypack/refLabel';
import VerseTooltip from '../studypack/VerseTooltip';
import {
  BRAND_EN, BRAND_ZH, LOOP_STEPS, LOOP_LINE_ZH, LOOP_LINE_EN, HERO_SUB_ZH, HERO_SUB_EN,
} from './landingStrings';

const NODE_X = [50, 300, 550] as const;
const NODE_Y = 40;
const NODE_R = 22;

const ARROWS = [
  { from: NODE_X[0] + NODE_R + 6, to: NODE_X[1] - NODE_R - 6 },
  { from: NODE_X[1] + NODE_R + 6, to: NODE_X[2] - NODE_R - 6 },
] as const;

const LoopDiagram: React.FC = () => (
  <svg
    viewBox="0 0 600 80"
    className="mx-auto h-auto w-full max-w-xl"
    role="img"
    aria-label={`${LOOP_LINE_ZH} · ${LOOP_LINE_EN}`}
    data-testid="loop-diagram"
  >
    {ARROWS.map((a, i) => (
      <g key={a.from}>
        <path d={`M${a.from} ${NODE_Y}H${a.to}`} stroke="var(--stl-surface-2)" strokeWidth="3" strokeLinecap="round" />
        <path d={`M${a.to - 12} ${NODE_Y - 9}L${a.to} ${NODE_Y}l-12 9`} stroke="var(--stl-surface-2)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path
          d={`M${a.from} ${NODE_Y}H${a.to}`}
          className={`ld-arrow-glow ld-arrow-glow-${i + 1}`}
          stroke="var(--stl-gold)" strokeWidth="4" strokeLinecap="round"
        />
      </g>
    ))}
    {NODE_X.map((x, i) => (
      <circle
        key={x} cx={x} cy={NODE_Y} r={NODE_R}
        className={`ld-node ld-node-${i + 1}`}
        strokeWidth="3"
        data-testid={`loop-node-${i + 1}`}
      />
    ))}
  </svg>
);

const LoopLabels: React.FC = () => (
  <ol
    className="mx-auto mt-3 grid w-full max-w-xl grid-cols-3 gap-2 text-center"
    data-testid="loop-labels"
  >
    {LOOP_STEPS.map((step, i) => (
      <li key={step.zh} className={`ld-step-label ld-step-label-${i + 1}`}>
        <span className="ld-step-zh block font-serif-sc font-bold">{step.zh}</span>
        <span className="ld-step-en block text-stl-text-2">{step.en}</span>
      </li>
    ))}
  </ol>
);

/**
 * A caption reference as a VerseTooltip (ADR-0003 §8: every reference is
 * interactive) — the same popup as slide refs, resolved from the bundled
 * Bible data. Falls back to plain text if the ref cannot be parsed.
 */
const CaptionRef: React.FC<{ text: string }> = ({ text }) => {
  const ref = findVerseRefs(text)[0];
  const plan = ref ? planExternalRef(ref) : null;
  if (!plan) return <>{text}</>;
  return <VerseTooltip label={text} title={bilingualRefLabel(ref)} load={plan.load} />;
};

/** Tiny low-contrast corner caption naming the theme's verse, Chinese first. */
const ThemeCaption: React.FC<{ theme: HeroTheme }> = ({ theme }) => (
  <p
    className="absolute right-0 top-4 text-base text-stl-text-2 sm:top-6"
    data-testid="theme-caption"
  >
    <span className="font-serif-sc"><CaptionRef text={theme.verseZh} /></span>
    {' · '}
    <CaptionRef text={theme.verseEn} />
  </p>
);

const LandingHero: React.FC<{ theme: HeroTheme }> = ({ theme }) => (
  <header className="relative pt-14 pb-10 text-center sm:pt-20">
    <ThemeCaption theme={theme} />
    <h1 className="ld-wordmark ld-fade ld-fade-1 font-bold tracking-tight text-stl-text">
      {BRAND_EN}
    </h1>
    <p className="ld-wordmark-zh ld-fade ld-fade-2 mt-1 font-serif-sc text-stl-gold">
      {BRAND_ZH}
    </p>
    <div className="ld-fade ld-fade-3 mt-10">
      <LoopDiagram />
      <LoopLabels />
    </div>
    <p className="ld-body ld-fade ld-fade-4 mx-auto mt-8 max-w-xl text-stl-text">
      <span className="block font-serif-sc">{HERO_SUB_ZH}</span>
      <span className="block text-stl-text-2">{HERO_SUB_EN}</span>
    </p>
  </header>
);

export default LandingHero;
