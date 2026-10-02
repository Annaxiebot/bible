/**
 * landing.spec.ts — landing page in a real browser · 首頁端到端測試
 *
 * The bare root URL shows the landing; its two CTAs set the hash and route
 * to TV mode and to the app respectively; a bookmarked hash bypasses it.
 */
import { test, expect, Page } from '@playwright/test';
import { APP_HASH, SAMPLE_PACK_HASH } from '../../components/landing/landingRoute';

async function openLanding(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('landing-page')).toBeVisible();
}

test.describe('Landing page', () => {
  test('bare root renders the landing, bilingual, with both door cards', async ({ page }) => {
    await openLanding(page);
    await expect(page.getByRole('heading', { name: 'Scripture to Life' })).toBeVisible();
    await expect(page.getByText('活出神的話').first()).toBeVisible();
    await expect(page.getByText('Understand the Word → Live the Word → Flourish').first()).toBeVisible();
    await expect(page.getByText('Group Bible Study')).toBeVisible();
    await expect(page.getByText('Personal Study')).toBeVisible();
    await expect(page.getByText('Scripture to Life · scripturetolife.org')).toBeVisible();
  });

  test('sample pack CTA navigates to TV presentation mode', async ({ page }) => {
    await openLanding(page);
    await page.getByRole('link', { name: /See a sample pack/ }).click();
    await expect(page).toHaveURL(new RegExp(SAMPLE_PACK_HASH.replace(/\//g, '\\/') + '$'));
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('Do Not Be Anxious 不要忧虑')).toBeVisible();
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
  });

  test('open-app CTA navigates to the Scripture Scholar app', async ({ page }) => {
    await openLanding(page);
    await page.getByRole('link', { name: /Open the app/ }).click();
    await expect(page).toHaveURL(/#app$/);
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
    // The app shell mounts: interactive controls appear that the landing lacks
    await expect(page.locator('button').first()).toBeVisible();
  });

  test('a bookmarked hash bypasses the landing entirely', async ({ page }) => {
    await page.goto(`./${APP_HASH}`);
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
  });

  test('landing is usable at phone width with ≥44px CTAs', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openLanding(page);
    for (const name of [/See a sample pack/, /Open the app/]) {
      const cta = page.getByRole('link', { name });
      await cta.scrollIntoViewIfNeeded();
      const box = await cta.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
