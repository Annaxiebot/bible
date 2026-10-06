/**
 * tv-ask-ai-citations.spec.ts — Ask AI checks the verses it cites · 问AI引用核对
 *
 * Roadmap P1 CitationValidator, on the real TV flow: the mocked answer
 * cites one real verse outside the pack (希伯来书 5:14) and one that does
 * not exist (约翰福音 3:99). Once the stream ends the real one is printed
 * under "引用经文 · Verses cited" with its 和合本 text from the bundled
 * data, the bad one reads as text + "（经文不存在 · no such verse）" and is
 * not a link, and the panel still fits without a scrollbar.
 * OpenRouter is mocked at the network level (no live AI call).
 */
import { test, expect } from '@playwright/test';
import { openTV, injectApiKey, mockOpenRouterStream, DEMO_SLIDE, goToSlide } from './helpers/tv';
import { streamChunks } from './helpers/askAnswers';
import { NO_SUCH_VERSE_MARK, VERSES_CITED_HEADING } from '../../components/studypack/tvHints';

const ANSWER =
  '耶稣叫我们不要为明天忧虑（v.34）。从整本圣经来看 · Across the whole Bible：' +
  '成熟的信心是操练出来的（希伯来书 5:14）；另见 约翰福音 3:99。';
/** 和合本 Hebrews 5:14, as in public/bible-data/cuv/HEB/5.json. */
const HEB_5_14_CUV = '惟独长大成人的才能吃干粮';
const SLACK_PX = 1;

for (const vp of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`cited verses are checked and printed at ${vp.width}×${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await injectApiKey(page);
    await mockOpenRouterStream(page, streamChunks(ANSWER));
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-model')).toBeVisible(); // the stream has ended

    const latest = page.getByTestId('ask-latest');
    const cited = latest.getByTestId('cited-verses');
    await expect(cited).toContainText(VERSES_CITED_HEADING);
    await expect(cited.getByTestId('cited-ref-label')).toHaveText(['希伯来书 5:14 · Hebrews 5:14']);
    await expect(cited).toContainText(HEB_5_14_CUV);

    const bad = latest.getByTestId('invalid-ref');
    await expect(bad).toHaveText(`约翰福音 3:99${NO_SUCH_VERSE_MARK}`);
    await expect(bad.getByTestId('verse-ref')).toHaveCount(0);
    await expect(latest.getByTestId('verse-ref')).toHaveText(['v.34', '希伯来书 5:14']);

    await expect.poll(() => page.getByTestId('ask-conversation')
      .evaluate((a, slack) => a.scrollHeight <= a.clientHeight + slack, SLACK_PX)).toBe(true);
    const box = (await cited.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height + SLACK_PX);
  });
}
