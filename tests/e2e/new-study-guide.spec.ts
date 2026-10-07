/**
 * new-study-guide.spec.ts — the first-visit "三步 Three steps" card · 新手三步端到端
 *
 * A fresh browser (no packs, nothing dismissed) opening #/new sees the
 * card above the form in large type; "知道了 Got it" hides it, and a
 * reload keeps it hidden (localStorage).
 */
import { test, expect } from '@playwright/test';
import { NS_GUIDE_TITLE, NS_GUIDE_STEPS, NS_GUIDE_GOT_IT } from '../../components/newstudy/newStudyStrings';
import { STORAGE_KEYS, NEW_STUDY_GUIDE_DISMISSED_VALUE } from '../../constants/storageKeys';
import { injectApiKey } from './helpers/tv';
import { openNewStudy } from './helpers/newStudy';

test('fresh browser: #/new shows the three-step card; Got it hides it for good', async ({ page }) => {
  await injectApiKey(page);
  await openNewStudy(page);
  const card = page.getByTestId('ns-guide');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading')).toHaveText(NS_GUIDE_TITLE);
  await expect(card.locator('li')).toContainText([...NS_GUIDE_STEPS]);
  expect(await card.locator('li').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
  // Above the form.
  const formTop = (await page.getByTestId('new-study-form').boundingBox())!.y;
  expect((await card.boundingBox())!.y).toBeLessThan(formTop);
  const gotIt = card.getByRole('button', { name: NS_GUIDE_GOT_IT });
  expect((await gotIt.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await gotIt.click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('new-study-form')).toBeVisible();
  // The bundled chapter has loaded by now, so the (faster) IndexedDB pack read has too: the absence is real.
  await expect(page.getByTestId('ns-verse-to').locator('option')).toHaveCount(45); // Mark 1, the first study
  expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEYS.NEW_STUDY_GUIDE_DISMISSED)).toBe(NEW_STUDY_GUIDE_DISMISSED_VALUE);
  await expect(page.getByTestId('ns-guide')).toHaveCount(0);
});
