/**
 * site-stats.spec.ts — site-wide usage counters end to end · 全站使用统计端到端 (ADR-0012)
 *
 * The RPCs are faked under the e2e Supabase base with the SQL's rules
 * (helpers/siteStats). A signed-in leader sees "全站使用 · Site-wide" under
 * My packs, read once per session (landing → leader home makes one call).
 * The landing keeps its four honest figures below PUBLIC_STATS_MIN_LEADERS
 * and shows the six live totals at the threshold. A leader pack presented
 * for 10 minutes (page clock) is logged once; a reload does not add one.
 */
import { test, expect } from '@playwright/test';
import { HONEST_NUMBERS } from '../../components/landing/landingStrings';
import { LEADER_HOME_HASH } from '../../components/leader/leaderRoute';
import { packHash } from '../../components/landing/landingRoute';
import { SITE_STAT_FIGURES, STATS_TITLE, STATS_LIVING, PUBLIC_STATS_MIN_LEADERS, MEETING_MIN_SECONDS } from '../../components/stats/statsRules';
import { E2E_LEADER_ID, seedLocalPack, fetchSamplePack } from './helpers/signup';
import { fakeLeaderSession, mockLeaderCounts } from './helpers/leader';
import { mockSiteStats } from './helpers/siteStats';

const TOTALS = { packs: 3, leaders: 2, meetings: 1, signups: 4, practices: 15, checkins_shared: 2 };
const PACK_ID = 'local-2026-10-09-matt6';

test.describe('Site-wide usage counters', () => {
  test('leader home: the six totals under My packs, Chinese first; read once for landing + home', async ({ page }) => {
    await fakeLeaderSession(page);
    await mockLeaderCounts(page, [], []);
    const server = await mockSiteStats(page, TOTALS);
    await page.goto('./');
    await expect(page.getByTestId('honest-numbers')).toBeVisible();   // below the threshold
    await expect.poll(() => server.statsCalls).toBe(1);
    await page.getByTestId('nav-leader').click();
    await expect(page).toHaveURL(new RegExp(`${LEADER_HOME_HASH}$`));
    const section = page.getByTestId('lh-site-stats');
    await expect(section.getByRole('heading', { level: 2 })).toHaveText(STATS_TITLE);
    for (const f of SITE_STAT_FIGURES) {
      const cell = page.getByTestId(`site-stat-${f.key}`);
      await expect(cell.getByRole('term')).toHaveText(String(TOTALS[f.key]));
      await expect(cell.getByRole('definition')).toHaveText(`${f.zh} ${f.en}`);
    }
    await expect(section.getByRole('heading', { level: 3 })).toHaveText(STATS_LIVING);
    expect(server.statsCalls).toBe(1);   // cached for the session
  });

  test('landing below the threshold: unchanged (the four honest figures, no live totals)', async ({ page }) => {
    const server = await mockSiteStats(page, { ...TOTALS, leaders: PUBLIC_STATS_MIN_LEADERS - 1 });
    await page.goto('./');
    await expect.poll(() => server.statsCalls).toBe(1);
    const strip = page.getByTestId('honest-numbers');
    await expect(strip.getByRole('term')).toHaveText(HONEST_NUMBERS.map(f => f.value));
    await expect(page.getByTestId('live-numbers')).toHaveCount(0);
  });

  test('landing at the threshold: the six live totals replace the honest figures', async ({ page }) => {
    const totals = { ...TOTALS, leaders: PUBLIC_STATS_MIN_LEADERS, signups: 1234 };
    await mockSiteStats(page, totals);
    await page.goto('./');
    const live = page.getByTestId('live-numbers');
    await expect(live.getByRole('term')).toHaveText(SITE_STAT_FIGURES.map(f => totals[f.key].toLocaleString('en-US')));
    await expect(page.getByTestId('honest-numbers')).toHaveCount(0);
  });

  test('a leader pack presented for 10 minutes is logged once; a reload does not add a second meeting', async ({ page }) => {
    await page.clock.install();
    // Before seeding: seedLocalPack loads the app, and a hash-only goto would not re-run the init script.
    const server = await mockSiteStats(page, TOTALS, [PACK_ID]);
    const sample = await fetchSamplePack(page);
    await seedLocalPack(page, { ...sample, id: PACK_ID, date: '2026-10-09', leaderId: E2E_LEADER_ID });
    await page.goto(`./${packHash(PACK_ID)}`);
    await expect(page.getByTestId('tv-counter')).toBeVisible();
    await page.clock.fastForward((MEETING_MIN_SECONDS - 60) * 1000);
    expect(server.logCalls).toHaveLength(0);
    await page.clock.fastForward(120_000);
    await expect.poll(() => server.logCalls.length).toBe(1);
    expect(server.logCalls[0]).toEqual({ p_pack_id: PACK_ID, p_seconds: expect.any(Number) });
    expect(server.meetings).toEqual([PACK_ID]);

    await page.reload();
    await expect(page.getByTestId('tv-counter')).toBeVisible();
    await page.clock.fastForward((MEETING_MIN_SECONDS + 60) * 1000);
    await expect.poll(() => server.logCalls.length).toBe(2);
    expect(server.meetings).toEqual([PACK_ID]);   // the server's 2-hour rule: still one meeting
  });
});
