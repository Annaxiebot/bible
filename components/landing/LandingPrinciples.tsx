/**
 * LandingPrinciples.tsx — "我們的原則 Our principles": five pillars · 五根柱子
 *
 * Each pillar is an icon plus a two-line bilingual statement, straight from
 * ADR-0003 (PILLARS in landingStrings). Icons share the landing's stroke
 * style (landingIcons). Static content; the section id is the nav target.
 */
import React from 'react';
import {
  PRINCIPLES_EYEBROW, PRINCIPLES_HEADING_ZH, PRINCIPLES_HEADING_EN, PRINCIPLES_DESC, PILLARS,
} from './landingStrings';
import { PointIconGlyph } from './landingIcons';
import LandingSection from './LandingSection';

const LandingPrinciples: React.FC = () => (
  <LandingSection
    id="principles"
    eyebrow={PRINCIPLES_EYEBROW}
    headingZh={PRINCIPLES_HEADING_ZH}
    headingEn={PRINCIPLES_HEADING_EN}
    description={PRINCIPLES_DESC}
  >
    <ul className="grid gap-4 text-left sm:grid-cols-2" data-testid="pillars">
      {PILLARS.map(pillar => (
        <li
          key={pillar.icon}
          data-testid={`pillar-${pillar.icon}`}
          className="ld-card flex gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-5 last:sm:col-span-2"
        >
          <span className="mt-1 shrink-0 text-amber-400/90"><PointIconGlyph name={pillar.icon} /></span>
          <span className="ld-body">
            <span className="block font-serif-sc text-slate-100">{pillar.zh}</span>
            <span className="block text-slate-400">{pillar.en}</span>
          </span>
        </li>
      ))}
    </ul>
  </LandingSection>
);

export default LandingPrinciples;
