/**
 * landing.spec.ts — landing page in a real browser · 首页端到端测试
 *
 * The bare root URL shows the landing (style "醒目 Bold": paper hero with
 * rings, loop cards, the dark group band with photos, personal study, next
 * study, honest numbers); its CTAs set the hash and route to TV mode, the
 * app and #/new; a bookmarked hash bypasses it; type and tap targets meet
 * the senior-friendly thresholds at phone and desktop widths with no
 * horizontal scroll; the headline is set in 霞鹜文楷; reduced motion stops
 * the rings. The sticky nav scrolls to its sections; the next-study block
 * shows the real sample pack and opens it in TV mode; sign-up shows the
 * demo line for the sample pack and the per-pack QR + #/signup link for an
 * owned pack. The saved-key state of the setup dialog (model rows) lives in
 * quick-ai-setup.spec.ts.
 */
import { test, expect, Page } from '@playwright/test';
import {
  BRAND_ZH, GROUP_CTA, PERSONAL_CTA, GROUP_TITLE_ZH, PERSONAL_TITLE_ZH, SITE_LINE, LOOP_STEPS,
  NAV_LINKS, NEXT_OPEN_CTA, NEXT_SIGNUP_CTA, HONEST_NUMBERS, GROUP_PHOTOS,
} from '../../components/landing/landingStrings';
import { SETUP_HASH, SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import { signupHash } from '../../components/signup/signupRoute';
import { SU_DEMO_LINE } from '../../components/signup/signupStrings';
import { routeOwnedSamplePack, expectedSignupUrl } from './helpers/signup';
import { SETUP_TITLE, SETUP_KEY_LABEL, SETUP_SAVE, SETUP_GET_KEY, SETUP_OWN_KEY_TOGGLE } from '../../components/setup/setupStrings';
import { OPENROUTER_KEYS_URL } from '../../services/aiDefaults';
import { STORAGE_KEYS } from '../../constants/storageKeys';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const MIN_BODY_PX = 20;
const MIN_TITLE_PX = 28;
const MIN_CTA_PX = 20;
const MIN_TAP_PX = 48;
const MIN_HEADLINE_PX = { phone: 52, desktop: 80 };
const WENKAI = 'LXGW WenKai';

async function openLanding(page: Page) {
  await page.goto('./');
  await expect(page.getByTestId('landing-page')).toBeVisible();
}

async function fontSizePx(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
}

test.describe('Landing page', () => {
  test('bare root renders the landing, Chinese first: headline, loop cards, group and personal sections', async ({ page }) => {
    await openLanding(page);
    await expect(page.getByTestId('hero-headline')).toHaveText(BRAND_ZH);
    for (const [i, step] of LOOP_STEPS.entries()) {
      await expect(page.getByTestId(`loop-card-${i + 1}`).getByRole('heading', { level: 3 })).toHaveText(`${step.zh}${step.en}`);
    }
    await expect(page.getByTestId('section-group').getByRole('heading', { level: 2 })).toContainText(GROUP_TITLE_ZH);
    await expect(page.getByTestId('section-personal').getByRole('heading', { level: 2 })).toContainText(PERSONAL_TITLE_ZH);
    await expect(page.getByText(SITE_LINE)).toBeVisible();
  });

  test('the headline is set in 霞鹜文楷 LXGW WenKai (system serif while it loads)', async ({ page }) => {
    await openLanding(page);
    const family = await page.getByTestId('hero-headline').evaluate(el => getComputedStyle(el).fontFamily);
    expect(family).toContain(WENKAI);
    expect(family.trim().endsWith('serif')).toBe(true);
    // Only the landing names the family: the app shell does not.
    await page.goto('./#app');
    expect(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily)).not.toContain(WENKAI);
  });

  test('hero sample pack CTA navigates to TV presentation mode', async ({ page }) => {
    await openLanding(page);
    await page.getByTestId('hero-sample').click();
    await expect(page).toHaveURL(/#\/pack\/2026-10-02-matt6$/);
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByTestId('landing-page')).toHaveCount(0);
  });

  test('open-app CTA navigates to the personal study app', async ({ page }) => {
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

  test('the landing has no AI status line, even with an own key stored', async ({ page }) => {
    await page.addInitScript(k => localStorage.setItem(k, 'sk-or-e2e-key'), STORAGE_KEYS.OPENROUTER_API_KEY);
    await openLanding(page);
    await expect(page.getByTestId('landing-setup-line')).toHaveCount(0);
    await expect(page.getByText('AI 已就绪 · AI ready')).toHaveCount(0);
  });

  test('#/setup: Save stores the own key and closes the dialog', async ({ page }) => {
    await page.goto(`./${SETUP_HASH}`);
    const dialog = page.getByRole('dialog', { name: SETUP_TITLE });
    await expect(dialog).toBeVisible();
    // Own key is the hidden, advanced path of the AI service page (ADR-0007): open its toggle first.
    await dialog.getByRole('button', { name: SETUP_OWN_KEY_TOGGLE }).click();
    expect(await fontSizePx(page, '[data-testid="quick-ai-setup"] input')).toBeGreaterThanOrEqual(18);
    await expect(dialog.getByRole('link', { name: new RegExp(SETUP_GET_KEY) }))
      .toHaveAttribute('href', OPENROUTER_KEYS_URL);
    await dialog.getByLabel(SETUP_KEY_LABEL).fill('sk-or-e2e-key');
    await dialog.getByRole('button', { name: SETUP_SAVE }).click();
    await expect(dialog).toHaveCount(0);
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

  for (const [name, size] of [['phone', PHONE], ['desktop', DESKTOP]] as const) {
    test(`type and tap targets meet senior-friendly thresholds at ${name} width`, async ({ page }) => {
      await page.setViewportSize(size);
      await openLanding(page);
      for (const body of ['.ld-sub .ld-en', '.ld-card p', '.ld-lede', '.ld-points .ld-en']) {
        expect(await fontSizePx(page, body), body).toBeGreaterThanOrEqual(MIN_BODY_PX);
      }
      expect(await fontSizePx(page, '.ld-h2')).toBeGreaterThanOrEqual(MIN_TITLE_PX);
      expect(await fontSizePx(page, '.ld-card-title')).toBeGreaterThanOrEqual(MIN_TITLE_PX);
      expect(await fontSizePx(page, '.ld-hero .stl-pill')).toBeGreaterThanOrEqual(MIN_CTA_PX);
      expect(await fontSizePx(page, '.ld-headline')).toBeGreaterThanOrEqual(MIN_HEADLINE_PX[name]);
      const targets = page.locator('.stl-pill:visible, .ld-nav-link:visible');
      expect(await targets.count()).toBeGreaterThan(8);
      for (const box of await targets.evaluateAll(els => els.map(el => el.getBoundingClientRect().height))) {
        expect(box).toBeGreaterThanOrEqual(MIN_TAP_PX);
      }
    });

    test(`no horizontal scroll at ${name} width (${size.width}px)`, async ({ page }) => {
      await page.setViewportSize(size);
      await openLanding(page);
      const root = page.getByTestId('landing-page');
      expect(await root.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
      // Nothing visible pokes out past the right edge (the rings and watermark are clipped by their sections).
      const overflow = await page.locator('.ld-wrap').evaluateAll((els, w) =>
        els.filter(el => el.getBoundingClientRect().right > w + 0.5).length, size.width);
      expect(overflow).toBe(0);
    });
  }

  test('the rings ripple by default and stop under prefers-reduced-motion; the page reads the same', async ({ page }) => {
    await openLanding(page);
    const waves = page.locator('[data-testid="hero-rings"] .ld-rings-wave circle');
    expect(await waves.evaluateAll(els => els.map(el => getComputedStyle(el).animationName))).toEqual(Array(4).fill('ld-ripple'));
    expect(await page.getByTestId('hero-rings').evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLanding(page);
    expect(await page.locator('.ld-rings-wave').evaluate(el => getComputedStyle(el).display)).toBe('none');
    expect(await waves.evaluateAll(els => els.map(el => getComputedStyle(el).animationName))).toEqual(Array(4).fill('none'));
    await expect(page.locator('.ld-rings-static circle').first()).toBeAttached();
    await expect(page.getByTestId('hero-headline')).toBeVisible();
    await expect(page.getByTestId('hero-sample')).toBeVisible();
  });

  test('the three photos load from public/landing with width/height and Chinese-first alt text', async ({ page }) => {
    await openLanding(page);
    const imgs = page.getByTestId('group-photos').locator('img');
    await expect(imgs).toHaveCount(GROUP_PHOTOS.length);
    for (const [i, photo] of GROUP_PHOTOS.entries()) {
      const img = imgs.nth(i);
      await img.scrollIntoViewIfNeeded();
      await expect(img).toHaveAttribute('width', String(photo.width));
      await expect(img).toHaveAttribute('height', String(photo.height));
      await expect(img).toHaveAttribute('alt', photo.alt);
      await expect(img).toHaveAttribute('loading', i === 0 ? 'eager' : 'lazy');
      await expect.poll(() => img.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(photo.width);
    }
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
      // Wheel only moves content if the root is the real scroll container. Chromium animates
      // wheel scrolling, so wait for each step to settle before re-checking, or the loop
      // fires extra steps mid-animation and overshoots (the page is now long enough to show it).
      const leader = page.getByTestId('leader-line');
      const scrollTop = () => root.evaluate(el => el.scrollTop);
      const settled = async () => { const a = await scrollTop(); await page.waitForTimeout(100); return a === await scrollTop(); };
      for (let i = 0; i < 8; i++) {
        await expect.poll(settled).toBe(true);
        const box = await leader.boundingBox();
        if (box && box.y >= 0 && box.y + box.height <= size.height) break;
        await page.mouse.wheel(0, 400);
      }
      await expect(leader).toBeInViewport();
    });
  }

  test('the sticky nav has one ≥48px button per NAV_LINKS entry that scrolls its section into view', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await openLanding(page);
    const nav = page.getByTestId('landing-nav');
    await expect(nav.getByRole('button')).toHaveCount(NAV_LINKS.length + 1);  // + the leader sign-in (leader-home.spec)
    for (const link of NAV_LINKS) {
      const button = page.getByTestId(`nav-${link.id}`);
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      await button.click();
      await expect(page.locator(`#${link.id}`)).toBeInViewport();
      await expect(nav).toBeInViewport();        // sticky: still on screen after scrolling
      await expect(page).toHaveURL(/\/bible\/$/); // no hash: the landing stays
    }
  });

  test('next-study shows the sample pack from public/packs and its CTA opens TV mode', async ({ page }) => {
    await openLanding(page);
    const pack = await (await page.request.get(`./packs/${SAMPLE_PACK_ID}.json`)).json();
    const block = page.getByTestId('next-study-pack');
    await expect(block).toContainText(pack.title);
    await expect(block).toContainText(pack.passageRef);
    await expect(block).toContainText(pack.date);
    const cta = page.getByRole('link', { name: NEXT_OPEN_CTA });
    await cta.scrollIntoViewIfNeeded();
    expect((await cta.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
    await cta.click();
    await expect(page).toHaveURL(new RegExp(`#/pack/${SAMPLE_PACK_ID}$`));
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
  });

  test('sign-up: the demo sample pack shows the no-sign-up line; an owned pack shows its QR and #/signup link', async ({ page }) => {
    await openLanding(page);
    await page.getByRole('button', { name: NEXT_SIGNUP_CTA }).click();
    const panel = page.getByTestId('next-study-signup');
    await expect(panel.getByTestId('next-study-demo')).toHaveText(SU_DEMO_LINE);
    await expect(panel.getByTestId('signup-qr')).toHaveCount(0);
    await routeOwnedSamplePack(page);
    await openLanding(page);
    await page.getByRole('button', { name: NEXT_SIGNUP_CTA }).click();
    await expect(panel.getByTestId('signup-qr')).toHaveAttribute('data-signup-url', expectedSignupUrl(page));
    await expect(panel.getByTestId('signup-qr').locator('svg')).toBeVisible();
    await expect(panel.getByRole('link')).toHaveAttribute('href', signupHash(SAMPLE_PACK_ID));
    await panel.getByRole('link').click();
    await expect(page.getByTestId('signup-form')).toBeVisible();
  });

  test('honest numbers render Chinese first with four figures', async ({ page }) => {
    await openLanding(page);
    const figures = page.getByTestId('honest-numbers').locator('dt');
    await expect(figures).toHaveCount(HONEST_NUMBERS.length);
    await expect(figures).toHaveText(HONEST_NUMBERS.map(f => f.value));
    expect(await fontSizePx(page, '.ld-figure')).toBeGreaterThan(await fontSizePx(page, '.ld-card-title'));
    // Big figures use the gold gradient (large text: gold-mid ≥ 3:1 on paper, stlTheme.test.ts).
    expect(await figures.first().evaluate(el => getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
  });
});
