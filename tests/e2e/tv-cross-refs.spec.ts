/**
 * tv-cross-refs.spec.ts — interactive cross-references on the TV · 交叉经文
 *
 * Verse popups resolve from the bundled Bible data (和合本 first, then BSB),
 * stay inside the viewport, and surface a load failure as a bilingual line.
 */
import { test, expect, Page } from '@playwright/test';
import { VERSE_LOAD_ERROR } from '../../components/studypack/tvHints';
import { openTV, goToSlide, DEMO_SLIDE } from './helpers/tv';

test.describe('Interactive cross-references (bundled Bible data)', () => {
  // The five cross-references span two slides: Luke + Philippians on 1/2, 1 Peter on 2/2.
  async function openCrossRefsSlide(page: Page, part: 1 | 2 = 1) {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.crossRefs + part - 1);
    await expect(page.getByText(new RegExp(`交叉经文 Cross-references · ${part}/2`))).toBeVisible();
  }

  test('hovering "Philippians 4:6–7" shows 和合本 text first, then BSB', async ({ page }) => {
    await openCrossRefsSlide(page);
    const ref = page.getByTestId('verse-ref').filter({ hasText: 'Philippians 4:6–7' });
    await expect(ref).toBeVisible();
    await ref.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(page.getByTestId('verse-tooltip-title')).toHaveText('腓立比书 4:6–7 · Philippians 4:6–7');
    await expect(tooltip).toContainText('应当一无挂虑');                 // 和合本 (简体) v.6
    await expect(tooltip).toContainText('Be anxious for nothing');      // BSB v.6
    await expect(tooltip).toContainText('present your requests to God');
    // Chinese renders before English within the verse block
    const text = await tooltip.innerText();
    expect(text.indexOf('应当一无挂虑')).toBeLessThan(text.indexOf('Be anxious for nothing'));
  });

  test('the Chinese form 路加福音 12:22–31 opens a long-range popup that stays in the viewport and scrolls', async ({ page }) => {
    await openCrossRefsSlide(page);
    const ref = page.getByTestId('verse-ref').filter({ hasText: '路加福音 12:22–31' });
    await ref.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('不要为生命忧虑');  // Luke 12:22 和合本
    const box = (await tooltip.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    // 10 bilingual verses cannot fit in half the viewport: content must scroll
    const scrollable = await tooltip.evaluate(el => el.scrollHeight > el.clientHeight);
    expect(scrollable).toBe(true);
  });

  test('a popup fetch failure shows the bilingual error line (no silent catch)', async ({ page }) => {
    await page.route('**/bible-data/**', route => route.fulfill({ status: 404, body: 'nope' }));
    await openCrossRefsSlide(page, 2);
    await page.getByTestId('verse-ref').filter({ hasText: '1 Peter 5:7' }).hover();
    await expect(page.getByRole('tooltip')).toContainText(VERSE_LOAD_ERROR);
  });
});
