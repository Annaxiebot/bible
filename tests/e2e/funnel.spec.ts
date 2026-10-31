/**
 * funnel.spec.ts — the anonymous New-study funnel end to end · 新建查经匿名漏斗端到端 (ADR-0025)
 *
 * log_funnel_event is faked under the SQL's rules (helpers/funnel) and
 * records every accepted count with its Authorization header:
 *   1. signed out: opening New study counts once, also across a reload
 *      (this browser's repeat window); an email sign-in counts "started"
 *      on send and "finished" when the code is accepted;
 *   2. signed in: Generate counts "pressed" then "ok" with the wait;
 *   3. a generation ended by Cancel, by leaving New study (✕) and by the
 *      page unloading (pagehide, keepalive) each counts "abandoned" once;
 *   4. the owner reads the funnel on the admin Stats tab; on a phone it is
 *      stacked cards with no sideways scroll.
 * Every count carries the anon key only — never a session token. No live
 * Supabase, no live AI.
 */
import { test, expect } from '@playwright/test';
import { SI_EMAIL_TOGGLE, SI_EMAIL_LABEL, SI_SEND, SI_CODE_LABEL, SI_VERIFY } from '../../components/signin/signInStrings';
import { NS_GENERATE, NS_EDIT_TITLE, NS_CANCEL, NS_BACK } from '../../components/newstudy/newStudyStrings';
import { ADMIN_HASH } from '../../components/landing/landingRoute';
import { JOHN3_REPLY_JSON } from '../../components/newstudy/__tests__/fixtures';
import { FUNNEL_MAX_WAIT_SECONDS } from '../../components/stats/funnelRules';
import { E2E_ANON_KEY } from './helpers/signup';
import { mockFunnel, FakeFunnel } from './helpers/funnel';
import { routeAuth, EMAIL, GOOD_CODE } from './helpers/emailAuth';
import { signInAsLeader, mockAIStream, mockAIHang } from './helpers/hostedAI';
import { openNewStudy, fillJohn3, chunked } from './helpers/newStudy';
import { fakeLeaderSession, mockLeaderCounts } from './helpers/leader';
import { mockSiteStats } from './helpers/siteStats';
import { mockAdminRpcs } from './helpers/admin';

const TOTALS = { packs: 3, leaders: 2, meetings: 1, signups: 4, practices: 15, checkins_shared: 2 };

/** Every count used the public anon key, and the fake refused nothing. */
function anonymousAndValid(funnel: FakeFunnel) {
  expect(funnel.calls.length).toBeGreaterThan(0);
  for (const call of funnel.calls) expect(call.authorization).toBe(`Bearer ${E2E_ANON_KEY}`);
  expect(funnel.refused).toEqual([]);
}

test.describe('Anonymous New-study funnel', () => {
  test('signed out: New study opened counts once across a reload; email sign-in counts started, then finished', async ({ page }) => {
    const funnel = await mockFunnel(page);
    await routeAuth(page);
    await openNewStudy(page);
    await expect.poll(() => funnel.events()).toEqual(['new_study_opened']);
    await page.reload();
    await expect(page.getByTestId('new-study-page')).toBeVisible();

    await page.getByRole('button', { name: SI_EMAIL_TOGGLE }).click();
    await page.getByLabel(SI_EMAIL_LABEL).fill(EMAIL);
    await page.getByRole('button', { name: SI_SEND }).click();
    await expect.poll(() => funnel.events()).toEqual(['new_study_opened', 'signin_started_email']);
    await page.getByLabel(SI_CODE_LABEL).fill(GOOD_CODE);
    await page.getByRole('button', { name: SI_VERIFY }).click();
    await expect(page.getByTestId('email-sign-in-done')).toBeVisible();
    await expect.poll(() => funnel.events()).toEqual(['new_study_opened', 'signin_started_email', 'signin_done_email']);
    anonymousAndValid(funnel);
  });

  test('signed in: Generate counts pressed, then a generated pack with the wait in seconds', async ({ page }) => {
    await signInAsLeader(page);
    const funnel = await mockFunnel(page);
    await mockAIStream(page, chunked(JOHN3_REPLY_JSON));
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect.poll(() => funnel.events()).toEqual(['new_study_opened', 'generate_pressed', 'pack_ok']);
    const wait = funnel.calls[2].p_wait_seconds!;
    expect(Number.isInteger(wait) && wait >= 0 && wait <= FUNNEL_MAX_WAIT_SECONDS).toBe(true);
    anonymousAndValid(funnel);
  });

  test('a generation ended by Cancel, by leaving New study, and by the page unloading each counts abandoned once', async ({ page }) => {
    await signInAsLeader(page);
    const funnel = await mockFunnel(page);
    await mockAIHang(page);
    await openNewStudy(page);
    const pressAndWait = async () => {
      await expect(page.getByTestId('ns-verse-to')).toBeEnabled();   // the default passage's verses are loaded
      await page.getByRole('button', { name: NS_GENERATE }).click();
      await expect(page.getByTestId('ns-progress')).toBeVisible();
    };

    await pressAndWait();
    await page.getByRole('button', { name: NS_CANCEL }).click();
    await expect(page.getByTestId('new-study-form')).toBeVisible();
    await expect.poll(() => funnel.events()).toEqual(['new_study_opened', 'generate_pressed', 'pack_abandoned']);

    await pressAndWait();
    await page.getByRole('link', { name: NS_BACK }).click();   // ✕ back to the home page mid-generation
    await expect(page.getByTestId('new-study-page')).toHaveCount(0);
    await expect.poll(() => funnel.events().slice(3)).toEqual(['generate_pressed', 'pack_abandoned']);

    await openNewStudy(page);   // inside the repeat window: not counted again
    await pressAndWait();
    await page.goto('about:blank');   // the tab navigates away: pagehide sends with keepalive
    await expect.poll(() => funnel.events().slice(5)).toEqual(['generate_pressed', 'pack_abandoned']);
    expect(funnel.events().filter(e => e === 'new_study_opened')).toHaveLength(1);
    anonymousAndValid(funnel);
  });

  test('the owner reads it on the admin Stats tab; on a phone it is stacked cards, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await fakeLeaderSession(page);
    await mockLeaderCounts(page, [], []);
    await mockSiteStats(page, TOTALS);
    await mockAdminRpcs(page, true);
    await page.goto(`./${ADMIN_HASH}`);
    await page.getByTestId('admin-tab-stats').click();
    await expect(page.getByTestId('admin-funnel-step-signin-started')).toContainText('Google 2 · 邮箱 Email 3');
    await expect(page.getByTestId('admin-funnel-day')).toHaveCount(2);
    await expect(page.getByTestId('admin-funnel-table').locator('thead')).toHaveCSS('position', 'absolute');
    const overflow = await page.getByTestId('admin-page').evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
