/**
 * member-pages.spec.ts — the member pages follow the landing's paper style · 成员页面样式端到端
 *
 * Owner decision (2026-10-04, ADR-0003 §15 note): #/signup (both steps and
 * the thank-you), #/checkin, the stop page and #/qr are paper pages with
 * ink text, Chinese headings in 霞鹜文楷 LXGW WenKai bold, a sans body ≥ 20px
 * and gold pills ≥ 48px. On a 390px phone none of them scrolls sideways.
 * Every state carries the brand link home (shared/PaperHeader, ≥ 48px);
 * tapping it opens the landing.
 * Backend mocked as in signup.spec.ts (helpers/signup); no live Supabase.
 */
import { test, expect, Page } from '@playwright/test';
import { SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import { signupHash, qrHash } from '../../components/signup/signupRoute';
import { checkinHash, checkinStopHash } from '../../components/checkin/checkinRoute';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../../components/setup/setupStrings';
import { routeOwnedSamplePack, mockBackend, E2E_SIGNUP_ID } from './helpers/signup';
import { mockOptOut } from './helpers/optout';
import { PAPER_HOME_TEST_ID } from '../../components/shared/PaperHeader';
import { LANDING_HASH } from '../../components/landing/landingRoute';
import { HOME_LINK_LABEL, BRAND_ZH } from '../../components/landing/landingStrings';

const PHONE = { width: 390, height: 844 };
const WENKAI = 'LXGW WenKai';
/** --stl-paper (#faf8f2) as getComputedStyle reports it; stlTheme.test.ts pins the token. */
const PAPER_RGB = 'rgb(250, 248, 242)';

/** Paper background, WenKai h1, body ≥ 20px, every pill ≥ 48px, no sideways scroll at the current width. */
async function expectPaperPage(page: Page, testId: string) {
  const root = page.getByTestId(testId);
  await expect(root).toBeVisible();
  expect(await root.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(PAPER_RGB);
  expect(await root.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(SETUP_MIN_FONT_PX);
  const h1 = page.getByRole('heading', { level: 1 });
  expect(await h1.evaluate(el => getComputedStyle(el).fontFamily)).toContain(WENKAI);
  expect(await h1.evaluate(el => getComputedStyle(el).fontWeight)).toBe('700');
  for (const height of await page.locator('.stl-pill:visible').evaluateAll(els => els.map(el => el.getBoundingClientRect().height))) {
    expect(height).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
  }
  expect(await root.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  const width = page.viewportSize()!.width;
  const pokingOut = await root.locator('*').evaluateAll((els, w) =>
    els.filter(el => el.getBoundingClientRect().right > w + 0.5).map(el => el.outerHTML.slice(0, 80)), width);
  expect(pokingOut).toEqual([]);
}

/** The brand link home: visible, named 返回首页 · Home, href "#", ≥ 48px tall, the Chinese in WenKai. */
async function expectHomeLink(page: Page) {
  const link = page.getByTestId(PAPER_HOME_TEST_ID);
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', LANDING_HASH);
  await expect(link).toHaveAccessibleName(HOME_LINK_LABEL);
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
  expect(await link.getByText(BRAND_ZH).evaluate(el => getComputedStyle(el).fontFamily)).toContain(WENKAI);
}

/** Tapping the brand link lands on the landing page (whose own pack fetch may still be in a mocked route: let it finish). */
async function goHome(page: Page) {
  await page.getByTestId(PAPER_HOME_TEST_ID).click();
  await expect(page.getByTestId('landing-page')).toBeVisible();
  await page.unrouteAll({ behavior: 'wait' });
}

test.describe('Member pages on paper at 390px', () => {
  test.use({ viewport: PHONE });

  test('sign-up: step 1, step 2 and the thank-you', async ({ page }) => {
    await routeOwnedSamplePack(page);
    await mockBackend(page);
    await page.goto(`./${signupHash(SAMPLE_PACK_ID)}`);
    await expect(page.getByTestId('su-practice')).toHaveCount(7);
    await expectPaperPage(page, 'signup-page');
    await expectHomeLink(page);
    expect(await page.locator('legend').evaluate(el => getComputedStyle(el).fontFamily)).toContain(WENKAI);
    const chosen = page.getByTestId('su-practice').first();
    await chosen.click();
    // A chosen card on paper: the gold-deep border (--stl-gold-deep #7a5518).
    expect(await chosen.evaluate(el => getComputedStyle(el).borderTopColor)).toBe('rgb(122, 85, 24)');

    await page.getByTestId('su-next').click();
    await expect(page.getByTestId('su-name')).toBeVisible();
    await expectPaperPage(page, 'signup-page');
    await expectHomeLink(page);
    expect(await page.getByRole('heading', { level: 2 }).evaluate(el => getComputedStyle(el).fontFamily)).toContain(WENKAI);

    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByTestId('su-submit').click();
    await expect(page.getByTestId('signup-thanks')).toBeVisible();
    await expectPaperPage(page, 'signup-page');
    await expectHomeLink(page);
    await goHome(page);
  });

  test('check-in page', async ({ page }) => {
    await mockBackend(page);
    await page.goto(`./${checkinHash(E2E_SIGNUP_ID, 'tue')}`);
    await expect(page.getByTestId('checkin-form')).toBeVisible();
    await expectPaperPage(page, 'checkin-page');
    await expectHomeLink(page);
    await goHome(page);
  });

  test('stop page, before and after Stop', async ({ page }) => {
    await mockBackend(page);
    await mockOptOut(page, { [E2E_SIGNUP_ID]: null });
    await page.goto(`./${checkinStopHash(E2E_SIGNUP_ID)}`);
    await expectPaperPage(page, 'stop-page');
    await expectHomeLink(page);
    await page.getByTestId('stop-button').click();
    await expect(page.getByTestId('stop-done')).toBeVisible();
    await expectPaperPage(page, 'stop-page');
    await expectHomeLink(page);
    await goHome(page);
  });

  test('QR page', async ({ page }) => {
    await routeOwnedSamplePack(page);
    await page.goto(`./${qrHash(SAMPLE_PACK_ID)}`);
    await expect(page.getByTestId('signup-qr').locator('svg')).toBeVisible();
    await expectPaperPage(page, 'qr-page');
    await expectHomeLink(page);
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId(PAPER_HOME_TEST_ID)).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    await goHome(page);
  });
});
