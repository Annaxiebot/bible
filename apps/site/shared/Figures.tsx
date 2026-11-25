/**
 * Figures.tsx — a row of "number + label" figures · 数字一览
 *
 * Shared (R3) by the leader home's site-wide totals (SiteStatsSection) and
 * the admin portal (leaders totals, stats tab): the number gold and bold,
 * the label "中文 English" quiet beside it, wrapping on narrow screens.
 * Each figure's test id is `${testIdPrefix}${key}`.
 */
import React from 'react';
import { textStyle } from '../newstudy/newStudyStyles';

export interface FigureItem { key: string; zh: string; en: string; value: number }

export const Figures: React.FC<{ items: readonly FigureItem[]; testIdPrefix: string }> = ({ items, testIdPrefix }) => (
  <dl className="flex flex-wrap gap-x-6 gap-y-2" style={textStyle}>
    {items.map(f => (
      <div key={f.key} data-testid={`${testIdPrefix}${f.key}`} className="flex items-baseline gap-2">
        <dt className="font-semibold text-stl-gold">{f.value.toLocaleString('en-US')}</dt>
        <dd className="text-stl-text-2">{f.zh} {f.en}</dd>
      </div>
    ))}
  </dl>
);
