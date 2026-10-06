/**
 * SiteStatsSection.test.tsx — "全站使用 · Site-wide" on the leader home · 全站使用测试 (ADR-0012)
 *
 * The RPC client is a fake answering site_stats like the SQL. OK → the six
 * totals, Chinese label first, the last two under the "living the Word"
 * caption; failure → one quiet line (no alert); loading → the loading line.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SITE_STATS_FN, SITE_STAT_FIGURES, STATS_TITLE, STATS_LIVING, STATS_FAILED, STATS_LOADING } from '../../stats/statsRules';

const REPLY = { packs: 3, leaders: 2, meetings: 1, signups: 4, practices: 15, checkins_shared: 2, as_of: '2026-10-06T00:00:00Z' };
let reply: { data: unknown; error: { message: string } | null } | 'pending' = { data: REPLY, error: null };
const rpc = vi.fn((fn: string) => {
  if (reply === 'pending') return new Promise(() => undefined);
  return Promise.resolve(fn === SITE_STATS_FN ? reply : { data: null, error: { message: 'unknown' } });
});
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => ({ rpc }) }));

import SiteStatsSection from '../SiteStatsSection';
import { resetSiteStatsCache } from '../../stats/siteStats';

beforeEach(() => {
  resetSiteStatsCache();
  rpc.mockClear();
  reply = { data: REPLY, error: null };
});

describe('SiteStatsSection', () => {
  it('shows the six totals with Chinese-first labels; practices and check-ins under 活出神的话', async () => {
    render(<SiteStatsSection />);
    const section = screen.getByTestId('lh-site-stats');
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(STATS_TITLE);
    for (const f of SITE_STAT_FIGURES) {
      const cell = await screen.findByTestId(`site-stat-${f.key}`);
      expect(within(cell).getByRole('term')).toHaveTextContent(String(REPLY[f.key]));
      expect(within(cell).getByRole('definition')).toHaveTextContent(`${f.zh} ${f.en}`);
    }
    const living = within(section).getByRole('heading', { level: 3 });
    expect(living).toHaveTextContent(STATS_LIVING);
    expect(living.nextElementSibling).toContainElement(screen.getByTestId('site-stat-practices'));
    expect(living.nextElementSibling).toContainElement(screen.getByTestId('site-stat-checkins_shared'));
  });

  it('a failure is one quiet line, never an alert', async () => {
    reply = { data: null, error: { message: 'permission denied' } };
    render(<SiteStatsSection />);
    expect(await screen.findByTestId('lh-site-stats-failed')).toHaveTextContent(STATS_FAILED);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByTestId('site-stat-packs')).toBeNull();
  });

  it('while loading: the loading line', () => {
    reply = 'pending';
    render(<SiteStatsSection />);
    expect(screen.getByTestId('lh-site-stats')).toHaveTextContent(STATS_LOADING);
  });
});
