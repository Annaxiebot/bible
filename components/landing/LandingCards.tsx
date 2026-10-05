/**
 * LandingCards.tsx — the loop as three cards · 一个循环
 *
 * 01 明白神的话 → 02 活出神的话 → 03 生命兴盛, each with a big outlined numeral
 * (decorative, aria-hidden), a Chinese-first title and its one-liner
 * (LOOP_STEPS). A small arrow joins each card to the next.
 */
import React from 'react';
import { LOOP_STEPS, LOOP_EYEBROW, LOOP_HEADING_ZH, LOOP_HEADING_EN } from './landingStrings';
import LandingSection, { Bilingual } from './LandingSection';

const numeral = (i: number) => String(i + 1).padStart(2, '0');

const LandingCards: React.FC = () => (
  <LandingSection id="loop" eyebrow={LOOP_EYEBROW} headingZh={LOOP_HEADING_ZH} headingEn={LOOP_HEADING_EN} className="ld-loop">
    <ol className="ld-loop-grid" data-testid="loop-cards">
      {LOOP_STEPS.map((step, i) => (
        <li key={step.zh} className="ld-card" data-testid={`loop-card-${i + 1}`}>
          {i < LOOP_STEPS.length - 1 && <span className="ld-card-next" aria-hidden="true">→</span>}
          <div className="ld-num" aria-hidden="true">{numeral(i)}</div>
          <h3 className="ld-card-title"><Bilingual zh={step.zh} en={step.en} /></h3>
          <p><Bilingual zh={step.line.zh} en={step.line.en} /></p>
        </li>
      ))}
    </ol>
  </LandingSection>
);

export default LandingCards;
