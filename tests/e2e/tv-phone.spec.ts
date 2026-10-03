/**
 * tv-phone.spec.ts — TV mode at 1080p and on phone viewports · 大屏与手机适配
 *
 * The densest slide fits a 1080p screen without scrolling (every slide at
 * 720p/1080p: tv-polish.spec.ts); on phones there is no horizontal
 * clipping, slides taller than the screen scroll vertically, and a
 * horizontal swipe still flips while vertical gestures scroll.
 */
import { test, expect } from '@playwright/test';
import { openTV, swipe, goToSlide, DEMO_SLIDE } from './helpers/tv';

test.describe('TV fit at 1080p', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the densest scripture slide (3 bilingual verses) fits without scrolling', async ({ page }) => {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.scripture + 4);
    await expect(page.getByText(/经文 Scripture.*· 5\/5/)).toBeVisible(); // vv.32–34
    const fits = await page
      .getByTestId('tv-presentation')
      .evaluate(root => {
        const area = root.querySelector('.overflow-y-auto.flex-1') as HTMLElement;
        return area !== null && area.scrollHeight <= area.clientHeight + 1;
      });
    expect(fits).toBe(true);
  });
});

// 320×568 is the smallest phone we support; there the densest slides are taller than the screen.
const SMALLEST_PHONE = { width: 320, height: 568 };
for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }, SMALLEST_PHONE]) {
  test.describe(`Phone viewport ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });

    test('scripture and life-menu slides have no horizontal clipping; taller content scrolls, never clips', async ({ page }) => {
      await openTV(page);
      const root = page.getByTestId('tv-presentation');
      const noHClip = () => root.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
      // Every scroll area of the slide may scroll vertically; report the most overflow seen.
      const scrolling = () => root.evaluate(el => {
        const frame = el.querySelector('.select-text') as HTMLElement;
        const areas = [frame, ...frame.querySelectorAll<HTMLElement>('.overflow-y-auto')];
        return {
          allScrollable: areas.every(a => ['auto', 'scroll'].includes(getComputedStyle(a).overflowY)),
          maxOverflow: Math.max(...areas.map(a => a.scrollHeight - a.clientHeight)),
        };
      });
      await goToSlide(page, DEMO_SLIDE.scripture + 4); // densest scripture slide, vv.32–34
      expect(await noHClip()).toBe(true);
      const scripture = await scrolling();
      expect(scripture.allScrollable).toBe(true);
      if (viewport === SMALLEST_PHONE) expect(scripture.maxOverflow).toBeGreaterThan(0);

      for (let i = 0; i < DEMO_SLIDE.lifeMenu + 1 - (DEMO_SLIDE.scripture + 4); i++) await page.keyboard.press('ArrowRight');
      await expect(page.getByText(/生活应用 Life Menu · 2\/2/)).toBeVisible();
      expect(await noHClip()).toBe(true);
      const menu = await scrolling();
      expect(menu.allScrollable).toBe(true);
      // On the smallest phone both slides are taller than the screen, so the scroll path is really exercised.
      if (viewport === SMALLEST_PHONE) expect(menu.maxOverflow).toBeGreaterThan(0);
    });

    test('a horizontal swipe still advances while vertical gestures scroll', async ({ page }) => {
      await openTV(page);
      const w = viewport.width;
      await swipe(page, { x: w * 0.8, y: 200 }, { x: w * 0.2, y: 210 }); // horizontal → next
      await expect(page.getByText(`2/${DEMO_SLIDE.total}`)).toBeVisible();
      await swipe(page, { x: w * 0.5, y: 300 }, { x: w * 0.5 - 20, y: 80 }); // vertical-dominant → no flip
      await expect(page.getByText(`2/${DEMO_SLIDE.total}`)).toBeVisible();
      await swipe(page, { x: w * 0.2, y: 200 }, { x: w * 0.8, y: 190 }); // horizontal back
      await expect(page.getByText(`1/${DEMO_SLIDE.total}`)).toBeVisible();
    });
  });
}
