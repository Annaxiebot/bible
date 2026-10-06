/**
 * LandingNumbers.tsx — "随时可用 Ready anywhere": four honest figures · 真实的数字
 *
 * Exactly four figures, every one verifiable from the repo (HONEST_NUMBERS
 * in landingStrings carries the sources; LandingNumbers.test.tsx re-counts
 * the bundled Bible data). No user, visitor, or church counts of any kind.
 * Big gold-gradient figures over a hairline grid, Chinese label first.
 *
 * Live variant (ADR-0012): once site_stats() reports at least
 * PUBLIC_STATS_MIN_LEADERS leaders, the section shows the six site-wide
 * totals instead. Below the threshold, while loading, or on any failure the
 * section is exactly the four honest figures.
 */
import React from 'react';
import {
  NUMBERS_EYEBROW, NUMBERS_HEADING_ZH, NUMBERS_HEADING_EN, NUMBERS_DESC, HONEST_NUMBERS,
} from './landingStrings';
import LandingSection from './LandingSection';
import { useSiteStats } from '../stats/siteStats';
import {
  SITE_STAT_FIGURES, LIVE_NUMBERS_EYEBROW, LIVE_NUMBERS_HEADING_ZH, LIVE_NUMBERS_HEADING_EN, LIVE_NUMBERS_DESC,
  SiteStats, isPublicWorthy,
} from '../stats/statsRules';

interface Figure { value: string; zh: string; en: string; note?: string }

const Figures: React.FC<{ figures: readonly Figure[]; testId: string; className: string }> = ({ figures, testId, className }) => (
  <dl className={className} data-testid={testId}>
    {figures.map(figure => (
      <div key={figure.en}>
        <dt className="ld-figure ld-hl">{figure.value}</dt>
        <dd>
          <span className="ld-figure-zh">{figure.zh}</span>
          <span className="ld-en">{figure.en}</span>
          {figure.note && <span className="ld-figure-note">{figure.note}</span>}
        </dd>
      </div>
    ))}
  </dl>
);

const liveFigures = (stats: SiteStats): Figure[] =>
  SITE_STAT_FIGURES.map(f => ({ value: stats[f.key].toLocaleString('en-US'), zh: f.zh, en: f.en }));

const LandingNumbers: React.FC = () => {
  const state = useSiteStats();
  if (state.status === 'ok' && isPublicWorthy(state.stats)) {
    return (
      <LandingSection id="numbers" eyebrow={LIVE_NUMBERS_EYEBROW} headingZh={LIVE_NUMBERS_HEADING_ZH}
        headingEn={LIVE_NUMBERS_HEADING_EN} description={LIVE_NUMBERS_DESC}>
        <Figures figures={liveFigures(state.stats)} testId="live-numbers" className="ld-nums ld-nums-3" />
      </LandingSection>
    );
  }
  return (
    <LandingSection id="numbers" eyebrow={NUMBERS_EYEBROW} headingZh={NUMBERS_HEADING_ZH}
      headingEn={NUMBERS_HEADING_EN} description={NUMBERS_DESC}>
      <Figures figures={HONEST_NUMBERS} testId="honest-numbers" className="ld-nums" />
    </LandingSection>
  );
};

export default LandingNumbers;
