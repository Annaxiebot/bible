/**
 * AdminStats.tsx — "统计 Stats" tab of #/admin · 全站统计 (ADR-0023)
 *
 * The six site_stats() totals (same labels as the leader home, statsRules)
 * plus signed-in accounts and active leaders this month, with one quiet
 * line saying what "active" means (the SQL's definition); below them the
 * anonymous New-study funnel (AdminFunnel, ADR-0025), which reads on its own.
 */
import React from 'react';
import type { AdminStats as Stats } from './adminRules';
import { AD_STAT_EXTRA, AD_ACTIVE_NOTE } from './adminStrings';
import { SITE_STAT_FIGURES } from '../stats/statsRules';
import { Figures } from '../shared/Figures';
import { textStyle } from '../newstudy/newStudyStyles';
import { AdminFunnel } from './AdminFunnel';

export const AdminStats: React.FC<{ stats: Stats }> = ({ stats }) => (
  <section data-testid="admin-stats" className="flex flex-col gap-4">
    <Figures items={SITE_STAT_FIGURES.map(f => ({ ...f, value: stats[f.key] }))} testIdPrefix="admin-stat-" />
    <Figures items={AD_STAT_EXTRA.map(f => ({ ...f, value: stats[f.key] }))} testIdPrefix="admin-stat-" />
    <p className="text-stl-text-3" style={textStyle}>{AD_ACTIVE_NOTE}</p>
    <AdminFunnel />
  </section>
);
