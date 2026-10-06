/**
 * editor-action-bar.spec.ts — Save / Preview in reach, and TV full screen · 操作栏与全屏端到端
 *
 * After a (mocked) generation the editor's top is in view and the action
 * bar sits on the bottom edge of the screen at 390×844 and 1280×720 — no
 * scrolling to reach Save / Preview — and at the end of the page the bar
 * does not cover the last section. Preview from the bar opens TV mode in
 * full screen (requested inside the click). In TV mode, F toggles
 * document.fullscreenElement, the one-time "按 F 全屏" hint shows once
 * for 4 s, and an Escape that leaves full screen keeps the deck open.
 */
import { test, expect, Page } from '@playwright/test';
import { NS_GENERATE, NS_EDIT_TITLE } from '../../components/newstudy/newStudyStrings';
import { FULLSCREEN_HINT } from '../../components/studypack/tvHints';
import { ESCAPE_GRACE_MS } from '../../components/studypack/useTVFullscreen';
import { JOHN3_REPLY_JSON } from '../../components/newstudy/__tests__/fixtures';
import { injectApiKey, mockOpenRouterStream, openTV } from './helpers/tv';
import { PACK_ID, openNewStudy, fillJohn3, chunked } from './helpers/newStudy';

const SHOTS = process.env.ACTION_BAR_SHOTS_DIR;
const isFullscreen = (page: Page) => page.evaluate(() => document.fullscreenElement !== null);

async function generate(page: Page) {
  await injectApiKey(page);
  await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON));
  await openNewStudy(page);
  await fillJohn3(page);
  await page.getByRole('button', { name: NS_GENERATE }).click();
  await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
  test.describe(`action bar at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('after generation: editor top in view, Save / Preview on the bottom edge, last section never covered', async ({ page }) => {
      await generate(page);
      const bar = page.getByTestId('ns-action-bar');
      // The editor's heading is scrolled into view (smooth scroll settles first).
      await expect.poll(async () => {
        const box = await page.getByText(NS_EDIT_TITLE).boundingBox();
        return box !== null && box.y >= 0 && box.y + box.height <= viewport.height;
      }).toBe(true);
      for (const id of ['ns-save', 'ns-preview']) {
        const box = (await page.getByTestId(id).boundingBox())!;
        expect(box.y, `${id} is on screen without scrolling`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(await page.getByTestId(id).evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
      }
      const barBox = (await bar.boundingBox())!;
      expect(Math.abs(barBox.y + barBox.height - viewport.height)).toBeLessThanOrEqual(1);
      expect(barBox.height, 'the bar stays slim').toBeLessThanOrEqual(viewport.width < 768 ? 140 : 90);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/action-bar-${viewport.width}x${viewport.height}.png` });

      // At the very end, the last section sits fully above the bar.
      await page.getByTestId('new-study-page').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await expect.poll(async () => {
        const last = (await page.getByTestId('ns-section').last().boundingBox())!;
        const barNow = (await bar.boundingBox())!;
        return last.y + last.height <= barNow.y + 0.5;
      }).toBe(true);
    });
  });
}

test.describe('TV full screen', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('Preview from the bar opens TV mode in full screen; Escape leaves full screen but keeps the deck', async ({ page }) => {
    await generate(page);
    await page.getByTestId('ns-preview').click();
    await expect(page).toHaveURL(new RegExp(`#/pack/${PACK_ID}$`));
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => isFullscreen(page)).toBe(false);
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    // A second Escape, windowed (after the grace period that ties an Escape to the exit), returns to the editor.
    await page.waitForTimeout(ESCAPE_GRACE_MS + 100);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('new-study-editor')).toBeVisible();
  });

  test('F toggles full screen; the "按 F 全屏" hint shows once, for 4 s', async ({ page }) => {
    await openTV(page);
    const hint = page.getByTestId('tv-fullscreen-hint');
    await expect(hint).toHaveText(FULLSCREEN_HINT);
    await expect(hint).toHaveCount(0, { timeout: 6000 });
    expect(await isFullscreen(page)).toBe(false);
    await page.keyboard.press('f');
    await expect.poll(() => isFullscreen(page)).toBe(true);
    await page.keyboard.press('f');
    await expect.poll(() => isFullscreen(page)).toBe(false);
    // Once seen, never again on this device.
    await page.reload();
    await expect(page.getByText('不要忧虑 Do Not Be Anxious')).toBeVisible();
    await page.waitForTimeout(500);
    await expect(hint).toHaveCount(0);
  });
});
