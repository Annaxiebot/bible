/**
 * tv-polish.spec.ts — calm, uncrowded slides on a TV · 大屏版面
 *
 * "It's about the Word, not the graphics": every slide of the sample pack
 * fits a 1280×720 and a 1920×1080 screen without scrolling and clear of the
 * Ask AI pill (buildSlides splits long sections, slideFit.ts); long
 * bilingual headings stay on one line; the hint, Ask AI pill and counter
 * never overlap; the key phrase is gold where it occurs; a quiet progress
 * bar tracks the counter.
 */
import { test, expect, Page } from '@playwright/test';
import { ASK_AI_LABEL } from '../../components/studypack/tvHints';
import { openTV, goToSlide, DEMO_SLIDE } from './helpers/tv';

/** Overflow of the slide frame and its inner scroll areas, and how far text reaches below the pill's top. */
async function slideFit(page: Page) {
  return page.getByTestId('tv-presentation').evaluate((root, askLabel) => {
    const frame = root.querySelector('.select-text') as HTMLElement;
    const scrollers = [frame, ...frame.querySelectorAll<HTMLElement>('.overflow-y-auto')];
    const overflow = Math.max(...scrollers.map(el => el.scrollHeight - el.clientHeight));
    const pillTop = root.querySelector(`[aria-label="${askLabel}"]`)!.getBoundingClientRect().top;
    let textBottom = 0;
    frame.querySelectorAll('h1, p, td').forEach(el => { textBottom = Math.max(textBottom, el.getBoundingClientRect().bottom); });
    return { overflow, textBelowPill: textBottom - pillTop, heading: frame.querySelector('h1')?.textContent ?? '' };
  }, ASK_AI_LABEL);
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test.describe(`TV slides at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test('no slide overflows the screen or runs under the Ask AI pill', async ({ page }) => {
      await openTV(page);
      for (let n = 1; n <= DEMO_SLIDE.total; n++) {
        if (n > 1) await page.keyboard.press('ArrowRight');
        await expect(page.getByTestId('tv-counter')).toHaveText(`${n}/${DEMO_SLIDE.total}`);
        const fit = await slideFit(page);
        expect(fit.overflow, `slide ${n} (${fit.heading}) scrolls`).toBeLessThanOrEqual(1);
        expect(fit.textBelowPill, `slide ${n} (${fit.heading}) runs under the pill`).toBeLessThanOrEqual(0);
      }
    });

    test('the first-slide hint, the Ask AI pill and the counter do not overlap', async ({ page }) => {
      await openTV(page);
      const boxes = await Promise.all([
        page.getByTestId('tv-hint'), page.getByRole('button', { name: ASK_AI_LABEL }), page.getByTestId('tv-counter'),
      ].map(async l => (await l.boundingBox())!));
      const overlap = (a: typeof boxes[0], b: typeof boxes[0]) =>
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap(boxes[0], boxes[1])).toBe(false);
      expect(overlap(boxes[0], boxes[2])).toBe(false);
      expect(overlap(boxes[1], boxes[2])).toBe(false);
    });

    test('the long scripture heading stays on one line, Chinese first, with its part counter', async ({ page }) => {
      await openTV(page);
      await goToSlide(page, DEMO_SLIDE.scripture);
      const heading = page.getByRole('heading', { level: 1 });
      await expect(heading).toHaveText('经文 Scripture — 马太福音 6:25–34 Matthew · 1/5');
      const { height, lineHeight } = await heading.evaluate(el => ({
        height: el.getBoundingClientRect().height,
        lineHeight: parseFloat(getComputedStyle(el).lineHeight),
      }));
      expect(height).toBeLessThan(lineHeight * 1.5);
    });
  });
}

test.describe('TV slide details', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('the key phrase is gold above the verses and where it occurs in 和合本 and BSB', async ({ page }) => {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.scripture);
    await expect(page.getByTestId('key-phrase')).toContainText('「不要为生命忧虑」');
    await expect(page.getByTestId('verse-emphasis')).toHaveText(['不要为生命忧虑', 'do not worry about your life']);
    const colours = await page.evaluate(() => {
      const css = (el: Element | null) => (el ? getComputedStyle(el).color : '');
      return {
        keyPhrase: css(document.querySelector('[data-testid="key-phrase"]')),
        emphasis: css(document.querySelector('[data-testid="verse-emphasis"]')),
        heading: css(document.querySelector('h1')),
      };
    });
    expect(colours.keyPhrase).toBe(colours.heading); // the one accent: stl-gold
    expect(colours.emphasis).toBe(colours.heading);
  });

  test('a continuation slide repeats the heading with its part counter', async ({ page }) => {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.context);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('背景 Context · 1/2');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('背景 Context · 2/2');
  });

  test('the progress bar grows with the counter and spans the screen at the end', async ({ page }) => {
    await openTV(page);
    const bar = page.getByRole('progressbar');
    await expect(bar).toHaveAttribute('aria-valuenow', '1');
    const fillWidth = () => bar.evaluate(el => (el.firstElementChild as HTMLElement).getBoundingClientRect().width / el.getBoundingClientRect().width);
    expect(await fillWidth()).toBeCloseTo(1 / DEMO_SLIDE.total, 2);
    await goToSlide(page, DEMO_SLIDE.total);
    await expect(bar).toHaveAttribute('aria-valuenow', String(DEMO_SLIDE.total));
    await expect.poll(fillWidth).toBeCloseTo(1, 2);
  });
});
