/**
 * tv-ask-ai-fit.spec.ts — Ask AI answers fit the panel · 问AI回答适配大屏
 *
 * Owner report: the overlay scrolled on almost every answer. A realistic
 * ~900-character bilingual answer (helpers/askAnswers.ts) must now fit the
 * near-full-screen panel without scrolling at 720p and 1080p, with the
 * input on screen, the text no smaller than the senior floor (ADR-0003
 * §15: 3.6vh) and verse-ref popups still opening inside the viewport. A
 * 3000-character answer falls back to scrolling with the thin themed bar.
 * OpenRouter is mocked at the network level (no live AI call).
 */
import { test, expect, Page } from '@playwright/test';
import { openTV, injectApiKey, mockOpenRouterStream, DEMO_SLIDE, goToSlide } from './helpers/tv';
import { REALISTIC_ANSWER, HUGE_ANSWER, streamChunks } from './helpers/askAnswers';
import { MIN_ANSWER_SCALE } from '../../components/studypack/fitScale';

/** TYPE_SCALE.verse / answerLong vh terms (principles.ts) — the floor and the unscaled long-answer size. */
const FLOOR_VH = 3.6;
const LONG_ANSWER_VH = 4;
/** Sub-pixel slack for measured sizes. */
const SLACK_PX = 1;

const VIEWPORTS = [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }];

async function askOnDiscussionSlide(page: Page, answer: string) {
  await injectApiKey(page);
  await mockOpenRouterStream(page, streamChunks(answer));
  await openTV(page);
  await goToSlide(page, DEMO_SLIDE.discussion);
  await page.keyboard.press('a');
  await expect(page.getByTestId('ask-answer').first()).toBeVisible();
  await expect(page.getByTestId('ask-panel')).toHaveAttribute('data-answer-state', 'idle'); // the stream has ended
}

/** The conversation area's scroll geometry and the latest answer's font size. */
function measure(page: Page) {
  return page.getByTestId('ask-conversation').evaluate(area => {
    const answers = area.querySelectorAll<HTMLElement>('[data-testid="ask-answer"]');
    const style = getComputedStyle(area);
    return {
      scrollHeight: area.scrollHeight,
      clientHeight: area.clientHeight,
      fontPx: parseFloat(getComputedStyle(answers[answers.length - 1]).fontSize),
      scrollbarWidth: style.scrollbarWidth,
      scrollbarColor: style.scrollbarColor,
    };
  });
}

async function expectInputOnScreen(page: Page, height: number) {
  const input = page.getByLabel(/Ask AI question/);
  await expect(input).toBeVisible();
  const box = (await input.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(height);
}

for (const vp of VIEWPORTS) {
  test.describe(`Ask AI fit at ${vp.width}×${vp.height}`, () => {
    test.use({ viewport: vp });
    const floorPx = (FLOOR_VH / 100) * vp.height;

    test('a realistic bilingual answer fits without scrolling, at or above the senior floor', async ({ page }) => {
      await askOnDiscussionSlide(page, REALISTIC_ANSWER);
      // Fits settle after the lazy markdown renderer and web fonts arrive.
      await expect.poll(async () => {
        const m = await measure(page);
        return m.scrollHeight <= m.clientHeight + SLACK_PX;
      }).toBe(true);
      const m = await measure(page);
      expect(m.fontPx).toBeGreaterThanOrEqual(floorPx - SLACK_PX / 100);
      expect(m.fontPx).toBeLessThanOrEqual((LONG_ANSWER_VH / 100) * vp.height + SLACK_PX / 100);
      await expectInputOnScreen(page, vp.height);

      // Verse-ref popups still open, fully inside the viewport, over the larger panel.
      await page.getByTestId('ask-latest').getByTestId('verse-ref').filter({ hasText: 'v.26' }).first().hover();
      const tooltip = page.getByRole('tooltip');
      await expect(tooltip).toContainText('飞鸟');
      const box = (await tooltip.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
    });

    test('a 3000-character answer stops at the floor and scrolls with the thin themed bar', async ({ page }) => {
      await askOnDiscussionSlide(page, HUGE_ANSWER);
      await expect.poll(async () => (await measure(page)).fontPx)
        .toBeCloseTo(MIN_ANSWER_SCALE * (LONG_ANSWER_VH / 100) * vp.height, 1);
      const m = await measure(page);
      expect(m.fontPx).toBeGreaterThanOrEqual(floorPx - SLACK_PX / 100);
      expect(m.scrollHeight).toBeGreaterThan(m.clientHeight + SLACK_PX); // scrolling is the last resort
      expect(m.scrollbarWidth).toBe('thin');
      expect(m.scrollbarColor).not.toBe('auto'); // theme-colored (index.html .tv-thin-scroll), not the default bar
      await expectInputOnScreen(page, vp.height);
      // Auto-scroll keeps the end of the latest answer in view.
      const atEnd = await page.getByTestId('ask-conversation')
        .evaluate(a => a.scrollTop + a.clientHeight >= a.scrollHeight - 2);
      expect(atEnd).toBe(true);
    });
  });
}
