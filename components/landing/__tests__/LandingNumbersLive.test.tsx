/**
 * LandingNumbersLive.test.tsx — live totals only at/above the public threshold · 首页全站数字测试 (ADR-0012)
 *
 * The RPC client is a fake answering site_stats. Below
 * PUBLIC_STATS_MIN_LEADERS, on failure and while loading the section is
 * exactly the four honest figures; at/above it the six live totals replace
 * them under the live heading.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { HONEST_NUMBERS } from '../landingStrings';
import { SITE_STATS_FN, SITE_STAT_FIGURES, PUBLIC_STATS_MIN_LEADERS, LIVE_NUMBERS_HEADING_ZH } from '../../stats/statsRules';

const base = { packs: 30, meetings: 12, signups: 1200, practices: 2400, checkins_shared: 800, as_of: '2026-10-06T00:00:00Z' };
let reply: { data: unknown; error: { message: string } | null } = { data: { ...base, leaders: 2 }, error: null };
const rpc = vi.fn(async (fn: string) => (fn === SITE_STATS_FN ? reply : { data: null, error: { message: 'unknown' } }));
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => ({ rpc }) }));

import LandingNumbers from '../LandingNumbers';
import { resetSiteStatsCache } from '../../stats/siteStats';

const honestValues = HONEST_NUMBERS.map(f => f.value);

beforeEach(() => {
  resetSiteStatsCache();
  rpc.mockClear();
});

async function renderSettled() {
  render(<LandingNumbers />);
  await waitFor(() => expect(rpc).toHaveBeenCalledTimes(1));
  await new Promise(r => setTimeout(r, 0));
}

describe('LandingNumbers — live variant', () => {
  it('below the threshold: unchanged (the four honest figures)', async () => {
    reply = { data: { ...base, leaders: PUBLIC_STATS_MIN_LEADERS - 1 }, error: null };
    await renderSettled();
    const values = within(screen.getByTestId('honest-numbers')).getAllByRole('term').map(el => el.textContent);
    expect(values).toEqual(honestValues);
    expect(screen.queryByTestId('live-numbers')).toBeNull();
  });

  it('a failed call: unchanged, nothing shown about the failure', async () => {
    reply = { data: null, error: { message: 'down' } };
    await renderSettled();
    expect(screen.getByTestId('honest-numbers')).toBeInTheDocument();
    expect(screen.queryByTestId('live-numbers')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('at the threshold: the six live totals replace the honest figures', async () => {
    reply = { data: { ...base, leaders: PUBLIC_STATS_MIN_LEADERS }, error: null };
    render(<LandingNumbers />);
    const live = await screen.findByTestId('live-numbers');
    expect(screen.queryByTestId('honest-numbers')).toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(LIVE_NUMBERS_HEADING_ZH);
    const values = within(live).getAllByRole('term').map(el => el.textContent);
    const stats = { ...base, leaders: PUBLIC_STATS_MIN_LEADERS };
    expect(values).toEqual(SITE_STAT_FIGURES.map(f => stats[f.key].toLocaleString('en-US')));
    for (const f of SITE_STAT_FIGURES) expect(within(live).getByText(f.zh).nextElementSibling?.textContent).toBe(f.en);
  });
});
