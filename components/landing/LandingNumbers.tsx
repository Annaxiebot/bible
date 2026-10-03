/**
 * LandingNumbers.tsx — "真实的数字 Honest numbers": four true figures · 真实的数字
 *
 * Exactly four figures, every one verifiable from the repo (HONEST_NUMBERS
 * in landingStrings carries the sources; LandingNumbers.test.tsx re-counts
 * the bundled Bible data). No user, visitor, or church counts of any kind.
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
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="honest-numbers">
      {HONEST_NUMBERS.map(figure => (
        <div key={figure.en} className="rounded-3xl border border-stl-border bg-stl-surface p-5">
          <dt className="ld-figure font-bold text-stl-gold">{figure.value}</dt>
          <dd className="ld-body mt-1">
            <span className="block font-serif-sc text-stl-text">{figure.zh}</span>
            <span className="block text-stl-text-2">{figure.en}</span>
            {'note' in figure && (
              <span className="ld-footer mt-2 block text-stl-text-3">{figure.note}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  </LandingSection>
);

export default LandingNumbers;
