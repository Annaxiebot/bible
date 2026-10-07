/**
 * new-study-pdf-guide.spec.ts — a pack from the leader's study-guide PDF, end to end · 讲义 PDF 端到端 (ADR-0019)
 *
 * In a real browser: "从讲义 PDF 生成" lazily loads pdfjs (its chunk is not
 * requested before), reads the committed fixture PDF on the device (no
 * request ever carries the PDF bytes), finds Mark 1:1–15 and opens the form
 * on it; Generate sends the extracted text with the server's guide prompt
 * (own key, OpenRouter mocked — no live AI); the editor shows the guide's
 * questions word for word, the bundled 和合本 + BSB verses, the origin labels
 * and the one tidied question flagged; the leader-only note is nowhere; Save
 * works. A scan (no text layer) gets the bilingual message.
 */
import { test, expect, Request } from '@playwright/test';
import { NS_GENERATE, NS_EDIT_TITLE, NS_SAVED } from '../../components/newstudy/newStudyStrings';
import {
  GD_PICK, GD_ERR_NO_TEXT, GD_FROM_GUIDE, GD_AI_DRAFTED, GD_PASSAGE_FOUND, notVerbatimLine,
} from '../../components/newstudy/guide/guideStrings';
import {
  GUIDE_FIXTURE_PATH, GUIDE_REPLY_JSON, GUIDE_QUESTIONS, GUIDE_INTRO, GUIDE_LEADER_NOTE, TIDIED_QUESTION,
} from '../../components/newstudy/guide/__tests__/guideFixture';
import { writePdf } from '../../components/newstudy/guide/__tests__/pdfWriter';
import { PACK_FROM_GUIDE_SYSTEM_PROMPT } from '../../supabase/functions/_shared/aiPrompts';
import { PDFJS_CMAPS_DIR } from '../../scripts/pdfjsCmapsDir';
import { injectApiKey, mockOpenRouterSequence, sseBody } from './helpers/tv';
import { openNewStudy, chunked } from './helpers/newStudy';

/** Every request's URL and body, to prove pdfjs loads lazily and the PDF never leaves the page. */
function watchRequests(page: import('@playwright/test').Page): Request[] {
  const seen: Request[] = [];
  page.on('request', r => seen.push(r));
  return seen;
}

test.describe('New study · from a study-guide PDF', () => {
  test('pick the PDF → passage found → mocked reply → editor keeps the guide\'s questions, flags the tidied one → Save', async ({ page }) => {
    await injectApiKey(page);
    const { bodies } = await mockOpenRouterSequence(page, [{ sse: sseBody(chunked(GUIDE_REPLY_JSON).map(c => ({ choices: [{ delta: { content: c } }] }))) }]);
    const requests = watchRequests(page);
    await openNewStudy(page);
    await expect(page.getByTestId('new-study-form')).toBeVisible();
    expect(requests.some(r => r.url().includes('pdfjs-dist'))).toBe(false);

    const pick = page.getByRole('button', { name: GD_PICK });
    expect((await pick.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await page.getByTestId('ns-guide-file').setInputFiles(GUIDE_FIXTURE_PATH);

    await expect(page.getByTestId('ns-guide-banner')).toBeVisible();
    await expect(page.getByTestId('ns-guide-passage')).toHaveText(GD_PASSAGE_FOUND.replace(/\{ref\}/g, '马可福音 1:1–15 · Mark 1:1–15'));
    expect(requests.some(r => r.url().includes('pdfjs-dist'))).toBe(true);   // loaded on demand
    await expect(page.getByTestId('ns-book')).toHaveValue('MRK');
    await expect(page.getByTestId('ns-verse-from')).toHaveValue('1');
    await expect(page.getByTestId('ns-verse-to')).toHaveValue('15');
    await page.getByTestId('ns-content-language').selectOption('zh-keywords');
    await page.getByTestId('ns-date').fill('2026-10-09');
    await page.getByRole('button', { name: NS_GENERATE }).click();

    const editor = page.getByTestId('new-study-editor');
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    // What was sent: the server's guide prompt first; the text pdfjs extracted in this browser as data.
    const sent = bodies()[0].messages!;
    expect(sent[0].content).toContain(PACK_FROM_GUIDE_SYSTEM_PROMPT);
    expect(sent[1].content).toContain(`1. ${GUIDE_QUESTIONS[0]}`);
    expect(requests.every(r => !(r.postData() ?? '').includes('%PDF'))).toBe(true);

    // Verses from the bundled 和合本 + BSB — not from the guide, not from the model.
    await expect(editor.getByText('神的儿子，耶稣基督福音的起头。')).toBeVisible();
    await expect(editor.getByText(/This is the beginning of the gospel of Jesus Christ, the Son of God\./)).toBeVisible();
    // The guide's questions, word for word; the tidied one is flagged.
    const discussion = editor.locator('[data-testid="ns-section"][data-kind="discussion"]');
    const questions = await discussion.locator('textarea').evaluateAll(els => els.map(e => (e as HTMLTextAreaElement).value));
    expect(questions).toEqual([GUIDE_QUESTIONS[0], GUIDE_QUESTIONS[1], TIDIED_QUESTION, GUIDE_QUESTIONS[3]]);
    await expect(discussion.getByTestId('ns-origin')).toHaveText(GD_FROM_GUIDE);
    await expect(discussion.getByTestId('ns-not-verbatim')).toHaveText(notVerbatimLine(TIDIED_QUESTION));
    const context = editor.locator('[data-testid="ns-section"][data-kind="context"]');
    expect(await context.locator('textarea').inputValue()).toContain(GUIDE_INTRO);
    await expect(context.getByTestId('ns-not-verbatim')).toHaveCount(0);
    await expect(editor.locator('[data-testid="ns-section"][data-kind="lifeMenu"]').getByTestId('ns-origin')).toHaveText(GD_AI_DRAFTED);
    await expect(page.getByText(GUIDE_LEADER_NOTE)).toHaveCount(0);

    // The leader takes the line over: the flag goes; Save.
    await discussion.locator('textarea').nth(2).fill(GUIDE_QUESTIONS[2]);
    await expect(discussion.getByTestId('ns-not-verbatim')).toHaveCount(0);
    await page.getByTestId('ns-save').click();
    await expect(page.getByRole('status')).toHaveText(NS_SAVED);
  });

  test('a scan (no text layer) → the bilingual message; the form stays', async ({ page }) => {
    await injectApiKey(page);
    await openNewStudy(page);
    await page.getByTestId('ns-guide-file').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from(writePdf([[]])) });
    await expect(page.getByRole('alert')).toHaveText(GD_ERR_NO_TEXT);
    await expect(page.getByTestId('new-study-form')).toBeVisible();
    await expect(page.getByTestId('ns-guide-banner')).toHaveCount(0);
  });

  test('the CMap files pdfjs needs for Chinese PDFs are served under the site base', async ({ page }) => {
    const cmap = await page.request.get(`./${PDFJS_CMAPS_DIR}/UniGB-UCS2-H.bcmap`);
    expect(cmap.status()).toBe(200);
    expect((await cmap.body()).length).toBeGreaterThan(0);
  });
});
