/**
 * tv-phone.spec.ts — TV mode at 1080p and on phone viewports · 大屏与手机适配
 *
 * The densest slide fits a 1080p screen without scrolling; on phones there
 * is no horizontal clipping, dense slides scroll vertically, and a
 * horizontal swipe still flips while vertical gestures scroll.
 */
import { test, expect } from '@playwright/test';
import { openTV, swipe } from './helpers/tv';

test.describe('TV fit at 1080p', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the densest scripture slide (3 bilingual verses) fits without scrolling', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture.*· 4\/4/)).toBeVisible(); // vv.32–34
    const fits = await page
      .getByTestId('tv-presentation')
      .evaluate(root => {
        const area = root.querySelector('.overflow-y-auto.flex-1') as HTMLElement;
        return area !== null && area.scrollHeight <= area.clientHeight + 1;
      });
    expect(fits).toBe(true);
  });
});

for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test.describe(`Phone viewport ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });

    test('scripture and life-menu slides have no horizontal clipping and scroll vertically', async ({ page }) => {
      await openTV(page);
      await page.keyboard.press('ArrowRight'); // scripture 1/4
      const root = page.getByTestId('tv-presentation');
      const noHClip = () => root.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
      expect(await noHClip()).toBe(true);

      for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight'); // life menu (slide 14/17)
      await expect(page.getByText(/生活应用 Life Menu/)).toBeVisible();
      expect(await noHClip()).toBe(true);
      // The dense 7-row menu exceeds a phone screen: the slide area must scroll
      const scrolls = await root.evaluate(el => {
        const content = el.querySelector('.select-text') as HTMLElement;
        return content.scrollHeight > content.clientHeight;
      });
      expect(scrolls).toBe(true);
    });

    test('a horizontal swipe still advances while vertical gestures scroll', async ({ page }) => {
      await openTV(page);
      const w = viewport.width;
      await swipe(page, { x: w * 0.8, y: 200 }, { x: w * 0.2, y: 210 }); // horizontal → next
      await expect(page.getByText('2/17')).toBeVisible();
      await swipe(page, { x: w * 0.5, y: 300 }, { x: w * 0.5 - 20, y: 80 }); // vertical-dominant → no flip
      await expect(page.getByText('2/17')).toBeVisible();
      await swipe(page, { x: w * 0.2, y: 200 }, { x: w * 0.8, y: 190 }); // horizontal back
      await expect(page.getByText('1/17')).toBeVisible();
    });
  });
}
