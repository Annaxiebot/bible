/**
 * personalize.spec.ts — 个性化 end to end · 显示偏好 + 组长定制
 *
 * A: the TV view's 显示偏好 panel (any viewer): hide a section, swap the
 * 中/英 line order, both remembered on this device; the one-time hint shows
 * first (first-use guide rule). B: the leader's standing AI instructions
 * (组长定制) reach the generation request as a fenced block and are
 * remembered on the next form.
 */
import { test, expect } from '@playwright/test';
import { openTV, DEMO_SLIDE, goToSlide, sseBody } from './helpers/tv';
import { signInAsLeader, mockAISequence } from './helpers/hostedAI';
import { openNewStudy, fillJohn3, chunked, openMoreOptions } from './helpers/newStudy';
import { JOHN3_REPLY_JSON_ZH } from '../../apps/site/newstudy/__tests__/fixtures';
import { NS_GENERATE, NS_EDIT_TITLE } from '../../shared/newstudy/newStudyStrings';
import { VP_HINT } from '../../apps/site/studypack/prefsStrings';
import { LEADER_INSTRUCTIONS_FENCE_OPEN } from '../../apps/site/newstudy/packPrompt';
import { BILINGUAL_SEPARATOR } from '../../shared/studypack/principles';

const TOTAL = DEMO_SLIDE.total;
// The sample pack's originalLanguage section fills 3 slides (DEMO_SLIDE 10–12).
const WITHOUT_ORIGINAL = TOTAL - 3;
const CONTEXT_LINE_ZH = `属于登山宝训${BILINGUAL_SEPARATOR}Part of the Sermon on the Mount.`;
const CONTEXT_LINE_EN = `Part of the Sermon on the Mount.${BILINGUAL_SEPARATOR}属于登山宝训`;

test.describe('显示偏好 View preferences (TV)', () => {
  test('one-time hint → hide 原文 → fewer slides, remembered after reload; clamped at the end', async ({ page }) => {
    await openTV(page);
    await expect(page.getByTestId('vp-hint')).toHaveText(VP_HINT);

    await page.getByTestId('vp-open').click();
    await expect(page.getByTestId('vp-hint')).toHaveCount(0);
    await page.getByTestId('vp-kind-originalLanguage').uncheck();
    await page.getByTestId('vp-close').click();
    await expect(page.getByText(`1/${WITHOUT_ORIGINAL}`)).toBeVisible();

    // No 原文 slide anywhere now: walk the whole shortened deck.
    for (let i = 1; i < WITHOUT_ORIGINAL; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('heading', { name: /原文 Original Language/ })).toHaveCount(0);
    }
    await expect(page.getByText(`${WITHOUT_ORIGINAL}/${WITHOUT_ORIGINAL}`)).toBeVisible();

    // Remembered on this device (a real reload; goto with the same hash is no navigation); the hint stays gone.
    await page.reload();
    await expect(page.getByText(`1/${WITHOUT_ORIGINAL}`)).toBeVisible();
    await expect(page.getByTestId('vp-hint')).toHaveCount(0);

    // Hiding while standing past the new end clamps, never a blank slide.
    await page.getByTestId('vp-open').click();
    await page.getByTestId('vp-kind-originalLanguage').check();
    await page.getByTestId('vp-close').click();
    await expect(page.getByTestId('tv-counter')).toContainText(`/${TOTAL}`);
    for (let i = 0; i < TOTAL; i++) await page.keyboard.press('ArrowRight'); // to the end (clamped)
    await expect(page.getByText(`${TOTAL}/${TOTAL}`)).toBeVisible();
    await page.getByTestId('vp-open').click();
    await page.getByTestId('vp-kind-reflection').uncheck();
    await page.getByTestId('vp-kind-lifeMenu').uncheck();
    await page.getByTestId('vp-close').click();
    await expect(page.getByTestId('tv-counter')).not.toContainText(`/${TOTAL}`); // deck really shrank
    const counter = await page.getByTestId('tv-counter').textContent();
    const [shown, of] = counter!.split('/').map(Number);
    expect(of).toBeLessThan(TOTAL);
    expect(shown).toBe(of); // clamped to the last remaining slide
    await page.keyboard.press('ArrowLeft'); // the stored index is clamped too: one press moves back immediately
    await expect(page.getByText(`${of - 1}/${of}`)).toBeVisible();
  });

  test('英文在前 swaps bilingual body lines on the slides', async ({ page }) => {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.context);
    await expect(page.getByText(CONTEXT_LINE_ZH)).toBeVisible();
    await page.getByTestId('vp-open').click();
    await page.getByTestId('vp-order-en').check();
    await page.getByTestId('vp-close').click();
    await expect(page.getByText(CONTEXT_LINE_EN)).toBeVisible();
  });
});

test.describe('组长定制 Leader standing instructions', () => {
  test('typed once → fenced into the generation request → remembered on the next form', async ({ page }) => {
    await signInAsLeader(page);
    const { bodies } = await mockAISequence(page, [{ sse: sseBody(chunked(JOHN3_REPLY_JSON_ZH).map(c => ({ choices: [{ delta: { content: c } }] }))) }]);
    await openNewStudy(page);
    await fillJohn3(page, 'zh-keywords');
    await openMoreOptions(page);
    const text = '问题更贴近职场妈妈';
    await page.getByTestId('ns-ai-instructions').fill(text);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();

    const content = bodies()[0].messages![0].content as string;
    expect(content).toContain(`LEADER'S STANDING PREFERENCES`);
    expect(content).toContain(`${LEADER_INSTRUCTIONS_FENCE_OPEN}\n${text}`);

    await openNewStudy(page);
    await openMoreOptions(page);
    await expect(page.getByTestId('ns-ai-instructions')).toHaveValue(text);
  });
});
