/**
 * admin.spec.ts — the owner's admin portal end to end · 管理后台端到端 (ADR-0023)
 *
 * Signed in through the dev-only __LEADER_E2E__ seam; the admin RPCs are
 * faked with the SQL's rule (helpers/admin: admin_* refuse with AD403 unless
 * is_site_admin). An admin's leader home carries the quiet "管理 · Admin"
 * link to #/admin, which shows the leaders table (search, gold shared
 * badge), the feedback cards and the stats; on a phone the table becomes
 * stacked cards. A regular leader's home has no link and is otherwise the
 * same; #/admin tells them "Admins only" and reads nothing else. No live
 * Supabase.
 */
import { test, expect } from '@playwright/test';
import { LEADER_HOME_HASH } from '../../components/leader/leaderRoute';
import { LH_TITLE } from '../../components/leader/leaderStrings';
import { ADMIN_HASH } from '../../components/landing/landingRoute';
import { IS_SITE_ADMIN_FN, ADMIN_DATA_FNS } from '../../components/admin/adminRules';
import { AD_TITLE, AD_DENIED, AD_SEARCH, ownerOnlyLine } from '../../components/admin/adminStrings';
import { FEEDBACK_SOURCE_LABELS } from '../../supabase/functions/_shared/feedback';
import { ADMIN_LEADERS, ADMIN_FEEDBACK } from '../../components/admin/__tests__/adminFixtures';
import { fakeLeaderSession, mockLeaderCounts, E2E_LEADER } from './helpers/leader';
import { mockSiteStats } from './helpers/siteStats';
import { mockAdminRpcs } from './helpers/admin';

const TOTALS = { packs: 3, leaders: 2, meetings: 1, signups: 4, practices: 15, checkins_shared: 2 };

async function signedIn(page: import('@playwright/test').Page, admin: boolean) {
  await fakeLeaderSession(page);
  await mockLeaderCounts(page, [], []);
  await mockSiteStats(page, TOTALS);
  return mockAdminRpcs(page, admin);
}

test.describe('Admin portal', () => {
  test('admin: the leader home links to #/admin; leaders table, search, feedback and stats', async ({ page }) => {
    const server = await signedIn(page, true);
    await page.goto(`./${LEADER_HOME_HASH}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LH_TITLE);
    await expect(page.getByTestId('lh-new')).toBeVisible();   // everything a leader has stays
    const link = page.getByTestId('lh-admin');
    await expect(link).toHaveText(AD_TITLE);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${ADMIN_HASH}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(AD_TITLE);
    await expect(page.getByTestId('admin-owner-line')).toHaveText(ownerOnlyLine(E2E_LEADER.email));

    const rows = page.getByTestId('admin-leader-row');
    await expect(rows).toHaveCount(ADMIN_LEADERS.length);
    await expect(rows.first()).toContainText('Peter Zhao');   // newest joined first
    await expect(rows.first().getByTestId('admin-joined')).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    await expect(page.getByTestId('admin-leaders-table').locator('thead')).toBeVisible();
    await expect(rows.filter({ hasText: 'Ruth Lee' }).getByTestId('admin-shared')).toHaveAttribute('data-has-shared', 'true');
    await page.getByRole('searchbox', { name: AD_SEARCH }).fill('ruth');
    await expect(rows).toHaveCount(1);

    await page.getByTestId('admin-tab-feedback').click();
    const cards = page.getByTestId('admin-feedback-card');
    await expect(cards).toHaveCount(ADMIN_FEEDBACK.length);
    await expect(cards.first().getByTestId('admin-feedback-source')).toHaveText(FEEDBACK_SOURCE_LABELS.tv);
    await expect(cards.first().getByTestId('admin-feedback-reply')).toHaveAttribute('href', 'mailto:member@example.org');

    await page.getByTestId('admin-tab-stats').click();
    await expect(page.getByTestId('admin-stat-active_leaders')).toContainText('3');
    // Each admin function read on opening #/admin (dev StrictMode mounts effects twice, so compare the set).
    expect([...new Set(server.calls.filter(c => c !== IS_SITE_ADMIN_FN))].sort()).toEqual([...ADMIN_DATA_FNS].sort());
  });

  test('admin on a phone: each leader is a stacked card, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signedIn(page, true);
    await page.goto(`./${ADMIN_HASH}`);
    await expect(page.getByTestId('admin-leader-row')).toHaveCount(ADMIN_LEADERS.length);
    await expect(page.getByTestId('admin-leaders-table').locator('thead')).toHaveCSS('position', 'absolute');
    const overflow = await page.getByTestId('admin-page').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('a regular leader: no Admin link, home unchanged; #/admin says Admins only and reads no admin data', async ({ page }) => {
    const server = await signedIn(page, false);
    await page.goto(`./${LEADER_HOME_HASH}`);
    await expect(page.getByTestId('lh-new')).toBeVisible();
    await expect(page.getByTestId('leader-sign-out')).toContainText(E2E_LEADER.email);
    await expect(page.getByTestId('site-stat-packs')).toBeVisible();
    await expect.poll(() => server.calls).toContain(IS_SITE_ADMIN_FN);
    await expect(page.getByTestId('lh-admin')).toHaveCount(0);

    await page.goto(`./${ADMIN_HASH}`);
    await expect(page.getByTestId('admin-denied')).toHaveText(AD_DENIED);
    await expect(page.getByTestId('admin-leaders')).toHaveCount(0);
    expect(server.calls.every(c => c === IS_SITE_ADMIN_FN)).toBe(true);
  });

  test('no session (this dev server has no Supabase sign-in): #/admin shows no data and asks nothing', async ({ page }) => {
    const server = await mockAdminRpcs(page, true);
    await page.goto(`./${ADMIN_HASH}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(AD_TITLE);
    await expect(page.getByTestId('admin-leaders')).toHaveCount(0);
    await expect(page.getByTestId('admin-owner-line')).toHaveCount(0);
    expect(server.calls).toEqual([]);
  });
});
