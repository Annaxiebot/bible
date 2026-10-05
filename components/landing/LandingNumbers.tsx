/**
 * LandingNumbers.tsx — "随时可用 Ready anywhere": four honest figures · 真实的数字
 *
 * Exactly four figures, every one verifiable from the repo (HONEST_NUMBERS
 * in landingStrings carries the sources; LandingNumbers.test.tsx re-counts
 * the bundled Bible data). No user, visitor, or church counts of any kind.
 * Big gold-gradient figures over a hairline grid, Chinese label first.
 */
import React from 'react';
import {
  NUMBERS_EYEBROW, NUMBERS_HEADING_ZH, NUMBERS_HEADING_EN, NUMBERS_DESC, HONEST_NUMBERS,
} from './landingStrings';
import LandingSection from './LandingSection';

const LandingNumbers: React.FC = () => (
  <LandingSection
    id="numbers"
    eyebrow={NUMBERS_EYEBROW}
    headingZh={NUMBERS_HEADING_ZH}
    headingEn={NUMBERS_HEADING_EN}
    description={NUMBERS_DESC}
  >
    <dl className="ld-nums" data-testid="honest-numbers">
      {HONEST_NUMBERS.map(figure => (
        <div key={figure.en}>
          <dt className="ld-figure ld-hl">{figure.value}</dt>
          <dd>
            <span className="ld-figure-zh">{figure.zh}</span>
            <span className="ld-en">{figure.en}</span>
            {'note' in figure && <span className="ld-figure-note">{figure.note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  </LandingSection>
);

export default LandingNumbers;
