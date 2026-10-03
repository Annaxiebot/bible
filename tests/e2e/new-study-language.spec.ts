/**
 * new-study-language.spec.ts — 内容语言 Content language end to end · 内容语言端到端
 *
 * The form defaults to 中文为主 (zh-keywords); with the OpenRouter endpoint
 * mocked to stream a zh-keywords pack, the editor and the TV preview show
 * Chinese-only lines with the English keyword in parentheses (no " · "
 * half, no English sentence), and the choice is remembered on the next
 * form. The rest of the New study flow is in new-study.spec.ts.
 */
import { test, expect } from '@playwright/test';
import { NS_GENERATE, NS_EDIT_TITLE, NS_EDIT, NS_EDIT_HINTS } from '../../components/newstudy/newStudyStrings';
import { JOHN3_REPLY_JSON_ZH, JOHN3_KEYWORD_ZH, JOHN3_KEYWORD_DECREASE_ZH } from '../../components/newstudy/__tests__/fixtures';
import { LIFE_AREAS, BILINGUAL_SEPARATOR } from '../../components/studypack/principles';
import { injectApiKey, mockOpenRouterSequence, sseBody } from './helpers/tv';
import { openNewStudy, fillJohn3, chunked } from './helpers/newStudy';

test.describe('New study · content language', () => {
  test('default content language (中文为主) + a mocked zh-keywords reply → editor → Preview shows Chinese-only lines with the English keyword in parentheses', async ({ page }) => {
    await injectApiKey(page);
    const { bodies } = await mockOpenRouterSequence(page, [{ sse: sseBody(chunked(JOHN3_REPLY_JSON_ZH).map(c => ({ choices: [{ delta: { content: c } }] }))) }]);
    await openNewStudy(page);
    await fillJohn3(page, null);   // leave the form's own default in place
    await expect(page.getByTestId('ns-content-language')).toHaveValue('zh-keywords');
    await page.getByRole('button', { name: NS_GENERATE }).click();

    const editor = page.getByTestId('new-study-editor');
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect(editor.getByText(NS_EDIT_HINTS['zh-keywords'])).toBeVisible();
    expect(bodies()[0].messages![1].content).toContain('CONTENT LANGUAGE: Chinese with English keywords');
    const context = editor.locator('[data-testid="ns-section"][data-kind="context"] textarea');
    expect(await context.inputValue()).toContain(`约翰的门徒为${JOHN3_KEYWORD_ZH}的事起了争论`);
    expect(await context.inputValue()).not.toContain(BILINGUAL_SEPARATOR);
    for (const area of LIFE_AREAS) await expect(editor.getByText(area, { exact: true })).toBeVisible();

    // The choice is remembered: the next form opens on it.
    await openNewStudy(page);
    await expect(page.getByTestId('ns-content-language')).toHaveValue('zh-keywords');
    await page.getByTestId('pack-row').first().getByRole('link', { name: NS_EDIT }).click();
    await expect(page.getByTestId('new-study-editor')).toBeVisible();

    // Preview: context, a discussion question and the life menu render the Chinese-only lines (no layout change).
    await page.getByTestId('ns-preview').click();
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('祂必兴旺，我必衰微 He Must Increase')).toBeVisible();   // the title stays bilingual
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('8/20')).toBeVisible();
    await expect(page.getByText(/^背景 Context/)).toBeVisible();
    const contextLine = page.getByText(`约翰的门徒为${JOHN3_KEYWORD_ZH}的事起了争论`);
    await expect(contextLine).toBeVisible();
    await expect(contextLine).not.toContainText(BILINGUAL_SEPARATOR);
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/讨论 Discussion · 4\/5/)).toBeVisible();
    await expect(page.getByText(`在你的生活里，${JOHN3_KEYWORD_DECREASE_ZH}意味着什么？`)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/^生活应用 Life Menu · 1\/2/)).toBeVisible();
    await expect(page.getByText(LIFE_AREAS[0], { exact: true })).toBeVisible();
    const practice = page.getByText(`一周三次散步时默想第30节的${JOHN3_KEYWORD_DECREASE_ZH}`);
    await expect(practice).toBeVisible();
    await expect(practice).not.toContainText(BILINGUAL_SEPARATOR);
    await expect(page.getByText(/Walk three times this week/)).toHaveCount(0);
  });
});
