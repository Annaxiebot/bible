/**
 * landing.spec.ts — landing page in a real browser · 首頁端到端測試
 *
 * The bare root URL shows the landing; its two CTAs set the hash and route
 * to TV mode and to the app; a bookmarked hash bypasses it; type meets the
 * senior-friendly thresholds at phone and desktop widths; reduced motion
 * renders the same layout with all animation off.
 */
import { test, expect, Page } from '@playwright/test';
import {
  BRAND_EN, GROUP_CTA, PERSONAL_CTA, GROUP_TITLE_ZH, PERSONAL_TITLE_ZH, SITE_LINE,
  SETUP_LINE, SETUP_DONE_LINE,
} from '../../components/landing/landingStrings';
import { SETUP_HASH } from '../../components/landing/landingRoute';
import {
  SETUP_TITLE, SETUP_KEY_LABEL, SETUP_SAVE, SETUP_GET_KEY,
} from '../../components/setup/setupStrings';
import { OPENROUTER_KEYS_URL } from '../../services/aiDefaults';
import { STORAGE_KEYS } from '../../constants/storageKeys';

const PHONE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
const MIN_BODY_PX = { phone: 18, desktop: 20 };
const MIN_TITLE_PX = 28;
const MIN_CTA_PX = 20;
const MIN_CTA_HEIGHT = 56;

async function openLanding(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('landing-page')).toBeVisible();
}

async function fontSizePx(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
}

test.describe('Landing page', () => {
  test('bare root renders the landing, Chinese first, with both door cards', async ({ page }) => {
    await openLanding(page);
    await expect(page.getByRole('heading', { level: 1, name: BRAND_EN })).toBeVisible();
    await expect(page.getByTestId('loop-diagram')).toBeVisible();
    await expect(page.getByTestId('card-group').getByText(GROUP_TITLE_ZH)).toBeVisible();
    await expect(page.getByTestId('card-personal').getByText(PERSONAL_TITLE_ZH)).toBeVisible();
    await expect(page.getByText(SITE_LINE)).toBeVisible();
  });

  test('sample pack CTA navigates to TV presentation mode', async ({ page }) => {
    await openLanding(page);
    await page.getByRole('link', { name: GROUP_CTA }).click();
    await expect(page).toHaveURL(/#\/pack\/2026-10-02-matt6$/);
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
  });

  test('open-app CTA navigates to the Scripture Scholar app', async ({ page }) => {
    await openLanding(page);
    await page.getByRole('link', { name: PERSONAL_CTA }).click();
    await expect(page).toHaveURL(/#app$/);
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
    await expect(page.locator('button').first()).toBeVisible();
  });

  test('a bookmarked hash bypasses the landing entirely', async ({ page }) => {
    await page.goto('./#app');
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
  });

  test('the 1-minute setup line opens the AI key dialog; Save stores the key and flips the line', async ({ page }) => {
    await openLanding(page);
    const line = page.getByTestId('landing-setup-line');
    await expect(line).toHaveText(SETUP_LINE);
    expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await line.click();
    const dialog = page.getByRole('dialog', { name: SETUP_TITLE });
    await expect(dialog).toBeVisible();
    expect(await fontSizePx(page, '[data-testid="quick-ai-setup"] input')).toBeGreaterThanOrEqual(18);
    await expect(dialog.getByRole('link', { name: new RegExp(SETUP_GET_KEY) }))
      .toHaveAttribute('href', OPENROUTER_KEYS_URL);
    await dialog.getByLabel(SETUP_KEY_LABEL).fill('sk-or-e2e-key');
    await dialog.getByRole('button', { name: SETUP_SAVE }).click();
    await expect(dialog).toHaveCount(0);
    await expect(line).toHaveText(SETUP_DONE_LINE);
    expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEYS.OPENROUTER_API_KEY)).toBe('sk-or-e2e-key');
    expect(page.url()).not.toContain('sk-or-e2e-key');
  });

  test('#/setup opens the landing with the dialog; closing it returns to the bare landing', async ({ page }) => {
    await page.goto(`./${SETUP_HASH}`);
    await expect(page.getByTestId('landing-page')).toBeVisible();
    await expect(page.getByRole('dialog', { name: SETUP_TITLE })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('landing-page')).toBeVisible();
    await expect(page).not.toHaveURL(/#\/setup/);
  });

  for (const [name, size, minBody] of [
    ['phone', PHONE, MIN_BODY_PX.phone],
    ['desktop', DESKTOP, MIN_BODY_PX.desktop],
  ] as const) {
    test(`type meets senior-friendly thresholds at ${name} width`, async ({ page }) => {
      await page.setViewportSize(size);
      await openLanding(page);
      expect(await fontSizePx(page, '.ld-body')).toBeGreaterThanOrEqual(minBody);
      expect(await fontSizePx(page, '.ld-card-title')).toBeGreaterThanOrEqual(MIN_TITLE_PX);
      expect(await fontSizePx(page, '.ld-cta')).toBeGreaterThanOrEqual(MIN_CTA_PX);
      expect(await fontSizePx(page, '.ld-wordmark')).toBeGreaterThan(await fontSizePx(page, '.ld-card-title'));
      for (const label of [GROUP_CTA, PERSONAL_CTA]) {
        const cta = page.getByRole('link', { name: label });
        await cta.scrollIntoViewIfNeeded();
        const box = await cta.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(MIN_CTA_HEIGHT);
      }
    });
  }

  for (const [id, layer, animationName] of [
    ['stars', 'theme-stars', 'ld-star-breathe'],
    ['dawn', 'theme-dawn', 'ld-ripple-drift'],
  ] as const) {
    test(`?theme=${id} renders that layer, click-through, animated by default`, async ({ page }) => {
      await page.goto(`./?theme=${id}`);
      await expect(page.getByTestId('landing-page')).toBeVisible();
      const sky = page.getByTestId('landing-sky');
      await expect(sky).toHaveAttribute('data-theme', id);
      await expect(page.getByTestId(layer)).toHaveCount(1);
      expect(await sky.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
      const names = await page.locator(`[data-testid="${layer}"], [data-testid="${layer}"] .ld-star`)
        .evaluateAll(els => els.map(el => getComputedStyle(el).animationName));
      expect(names).toContain(animationName);
      await expect(page.getByTestId('theme-caption')).toContainText(' · ');
    });

    test(`?theme=${id} under prefers-reduced-motion is static, layout intact`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`./?theme=${id}`);
      await expect(page.getByTestId('landing-page')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: BRAND_EN })).toBeVisible();
      await expect(page.getByTestId('card-group')).toBeVisible();
      const animated = '.ld-node, .ld-fade, .ld-arrow-glow, .ld-dawn, .ld-ripples, .ld-star, .ld-bird-flight';
      const animations = await page.locator(animated).evaluateAll(els =>
        els.map(el => getComputedStyle(el).animationName)
      );
      expect(animations.length).toBeGreaterThan(0);
      expect(animations.every(a => a === 'none')).toBe(true);
      expect(await page.locator('.ld-wordmark').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    });
  }

  test('?theme=stars: hovering the verse caption shows 诗篇 text first, then BSB', async ({ page }) => {
    await page.goto('./?theme=stars');
    await expect(page.getByTestId('landing-page')).toBeVisible();
    const zhRef = page.getByTestId('theme-caption').getByTestId('verse-ref').first();
    await expect(zhRef).toHaveText('詩篇 147:4');
    await zhRef.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(page.getByTestId('verse-tooltip-title')).toHaveText('诗篇 147:4 · Psalm 147:4');
    await expect(tooltip).toContainText('星宿');                          // 和合本 Ps 147:4
    await expect(tooltip).toContainText('number of the stars');          // BSB
    const text = await tooltip.innerText();
    expect(text.indexOf('星宿')).toBeLessThan(text.indexOf('number of the stars'));
  });

  for (const [name, size] of [['desktop', { width: 1280, height: 768 }], ['phone', PHONE]] as const) {
    test(`the landing scrolls at ${name} width: root is viewport-sized and the leader line comes into view`, async ({ page }) => {
      await page.setViewportSize(size);
      await openLanding(page);
      const root = page.getByTestId('landing-page');
      expect(await root.evaluate(el => el.clientHeight)).toBe(size.height);
      expect(await root.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await page.mouse.move(size.width / 2, size.height / 2);
      await page.mouse.wheel(0, 800);
      await expect.poll(() => root.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      // Wheel only moves content if the root is the real scroll container.
      const leader = page.getByTestId('leader-line');
      for (let i = 0; i < 6 && !(await leader.isVisible() && await leader.boundingBox().then(b => b!.y < size.height)); i++) {
        await page.mouse.wheel(0, 800);
      }
      await expect(leader).toBeInViewport();
    });
  }

  test('motion is on by default: the loop nodes animate', async ({ page }) => {
    await openLanding(page);
    const names = await page.locator('.ld-node').evaluateAll(els =>
      els.map(el => getComputedStyle(el).animationName)
    );
    expect(names).toHaveLength(3);
    expect(names.every(n => n === 'ld-node-glow')).toBe(true);
  });

  test('the theme is pinned for the session across a reload', async ({ page }) => {
    await page.goto('./?theme=dawn');
    await expect(page.getByTestId('landing-sky')).toHaveAttribute('data-theme', 'dawn');
    await page.goto('./');
    await expect(page.getByTestId('landing-sky')).toHaveAttribute('data-theme', 'dawn');
  });
});
