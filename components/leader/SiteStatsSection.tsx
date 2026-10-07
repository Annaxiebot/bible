/**
 * SiteStatsSection.tsx — "全站使用 · Site-wide" on the leader home · 全站使用 (ADR-0012)
 *
 * Private to signed-in leaders until the site passes PUBLIC_STATS_MIN_LEADERS
 * (then the landing shows the same totals). Six totals, Chinese label first;
 * the last two sit under the "活出神的话 · Living the Word" caption. Loading
 * and failure are one quiet line each — never an alert, never a broken page.
 */
import React from 'react';
import { useSiteStats } from '../stats/siteStats';
import {
  SITE_STAT_FIGURES, LIVING_KEYS, STATS_TITLE, STATS_LIVING, STATS_LOADING, STATS_FAILED, STATS_PRIVATE_NOTE,
  SiteStats, StatFigure,
} from '../stats/statsRules';
import { textStyle } from '../newstudy/newStudyStyles';

const FigureList: React.FC<{ figures: StatFigure[]; stats: SiteStats }> = ({ figures, stats }) => (
  <dl className="flex flex-wrap gap-x-6 gap-y-2" style={textStyle}>
    {figures.map(f => (
      <div key={f.key} data-testid={`site-stat-${f.key}`} className="flex items-baseline gap-2">
        <dt className="font-semibold text-stl-gold">{stats[f.key].toLocaleString('en-US')}</dt>
        <dd className="text-stl-text-2">{f.zh} {f.en}</dd>
      </div>
    ))}
  </dl>
);

const SiteStatsSection: React.FC = () => {
  const state = useSiteStats();
  const quiet = (text: string) => <p className="text-stl-text-3" style={textStyle}>{text}</p>;
  return (
    <section data-testid="lh-site-stats" className="flex flex-col gap-3 border-t border-stl-border pt-6">
      <h2 className="text-stl-text-2" style={textStyle}>{STATS_TITLE}</h2>
      {state.status === 'loading' && quiet(STATS_LOADING)}
      {state.status === 'failed' && <div data-testid="lh-site-stats-failed">{quiet(STATS_FAILED)}</div>}
      {state.status === 'ok' && (
        <>
          <FigureList figures={SITE_STAT_FIGURES.filter(f => !LIVING_KEYS.includes(f.key))} stats={state.stats} />
          <h3 className="text-stl-text-3" style={textStyle}>{STATS_LIVING}</h3>
          <FigureList figures={SITE_STAT_FIGURES.filter(f => LIVING_KEYS.includes(f.key))} stats={state.stats} />
          {quiet(STATS_PRIVATE_NOTE)}
        </>
      )}
    </section>
  );
};

export default SiteStatsSection;
