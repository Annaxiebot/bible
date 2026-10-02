/**
 * new-study.spec.ts — "新建查经 New study" in a real browser · 新建查经端到端
 *
 * #/new renders the form Chinese-first (large type, ≥48px targets); with the
 * OpenRouter endpoint mocked to stream a valid pack JSON, generating
 * John 3:22–36 yields an editor holding the real bundled verses; Save then
 * Preview opens TV mode from IndexedDB showing 和合本|BSB verses and 18
 * slides; Export downloads the pack JSON. No live AI call is made.
 */
import { test, expect, Page } from '@playwright/test';
import { NEW_STUDY_HASH } from '../../components/landing/landingRoute';
import { NEW_STUDY_LINE } from '../../components/landing/landingStrings';
import { SETUP_TITLE } from '../../components/setup/setupStrings';
import {
  NS_TITLE, NS_BOOK, NS_GENERATE, NS_EDIT_TITLE, NS_SAVE, NS_SAVED, NS_PREVIEW, NS_EXPORT, NS_MY_PACKS,
  NS_SCRIPTURE_NOTE, NS_RETRY, NS_ERR_NO_JSON, NS_RANGE_UPDATED, NS_SECTION_REMOVE_CONFIRM,
} from '../../components/newstudy/newStudyStrings';
import { PACK_CONTINUE_PROMPT } from '../../components/newstudy/packPrompt';
import { JOHN3_REPLY_JSON } from '../../components/newstudy/__tests__/fixtures';
import { LIFE_AREAS } from '../../components/studypack/principles';
import { injectApiKey, mockOpenRouterStream, mockOpenRouterSequence, sseBody, OPENROUTER_CHAT_URL } from './helpers/tv';

const PACK_ID = 'local-2026-10-02-jhn3';

async function openNewStudy(page: Page) {
  await page.goto(`./${NEW_STUDY_HASH}`);
  await expect(page.getByTestId('new-study-page')).toBeVisible();
}

/** John 3 from the dropdowns: 36 verse options come from the real bundled chapter; To defaults to 36. */
async function fillJohn3(page: Page) {
  await page.getByTestId('ns-book').selectOption('JHN');
  await page.getByTestId('ns-chapter').selectOption('3');
  await expect(page.getByTestId('ns-verse-to').locator('option')).toHaveCount(36);
  await expect(page.getByTestId('ns-verse-to')).toHaveValue('36');
  await page.getByTestId('ns-verse-from').selectOption('22');
  await page.getByTestId('ns-date').fill('2026-10-02');
}

function chunked(text: string, size = 200): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

test.describe('New study', () => {
  test('the landing has the New study line; #/new renders the Chinese-first form with senior-friendly type', async ({ page }) => {
    await injectApiKey(page);
    await page.goto('./');
    const line = page.getByTestId('landing-new-study-line');
    await expect(line).toHaveText(NEW_STUDY_LINE);
    expect((await line.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await line.click();
    await expect(page).toHaveURL(/#\/new$/);
    await expect(page.getByTestId('new-study-page')).toBeVisible();
    await expect(page.getByText(NS_TITLE)).toBeVisible();
    const form = page.getByTestId('new-study-form');
    await expect(form).toBeVisible();
    await expect(form.getByText(NS_BOOK)).toBeVisible();
    await expect(page.getByTestId('ns-book')).toHaveValue('MAT');
    await expect(page.getByTestId('ns-book').locator('option', { hasText: '约翰福音 John' })).toHaveCount(1);
    expect(await page.getByTestId('ns-book').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    expect((await page.getByTestId('ns-generate').boundingBox())!.height).toBeGreaterThanOrEqual(48);
    // Chapter and verses are native dropdowns driven by real data (Matthew: 28 chapters; 6:25–34 default).
    for (const id of ['ns-chapter', 'ns-verse-from', 'ns-verse-to']) {
      const select = page.getByTestId(id);
      await expect(select).toHaveJSProperty('tagName', 'SELECT');
      expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      expect(await select.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    }
    await expect(page.getByTestId('ns-chapter').locator('option')).toHaveCount(28);
    await expect(page.getByTestId('ns-verse-to').locator('option')).toHaveCount(34);
    await expect(page.getByTestId('ns-verse-from')).toHaveValue('25');
    await expect(page.getByTestId('ns-verse-to')).toHaveValue('34');
    await expect(page.getByText(NS_MY_PACKS)).toBeVisible();
  });

  test('without a key, the quick AI setup renders inline instead of the form', async ({ page }) => {
    await openNewStudy(page);
    await expect(page.getByTestId('quick-ai-setup')).toBeVisible();
    await expect(page.getByText(SETUP_TITLE)).toBeVisible();
    await expect(page.getByTestId('new-study-form')).toHaveCount(0);
  });

  test('generate John 3:22–36 (mocked model) → editor with bundled verses → Save → Preview opens TV mode from IndexedDB → Export', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON));
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();

    const editor = page.getByTestId('new-study-editor');
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect(editor.getByText(NS_SCRIPTURE_NOTE)).toBeVisible();
    // Real bundled verses — 和合本 and BSB — not model text.
    await expect(editor.getByText(/这事以后，耶稣和门徒到了犹太地/)).toBeVisible();
    await expect(editor.getByText(/After this, Jesus and His disciples went into the Judean countryside/)).toBeVisible();
    await expect(editor.getByText(/他必兴旺，我必衰微/).first()).toBeVisible();
    for (const area of LIFE_AREAS) await expect(editor.getByText(area, { exact: true })).toBeVisible();

    await page.getByTestId('ns-save').click();
    await expect(page.getByRole('status')).toHaveText(NS_SAVED);

    await page.getByTestId('ns-preview').click();
    await expect(page).toHaveURL(new RegExp(`#/pack/${PACK_ID}$`));
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('祂必兴旺，我必衰微 He Must Increase')).toBeVisible();
    await expect(page.getByText('1/18')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture — 约翰福音 3:22–36 John · 1\/5/)).toBeVisible();
    await expect(page.getByText('和合本 CUV', { exact: true })).toBeVisible();
    await expect(page.getByText('BSB', { exact: true })).toBeVisible();
    await expect(page.getByText(/这事以后，耶稣和门徒到了犹太地/)).toBeVisible();
    await expect(page.getByText(/Jesus and His disciples went into the Judean countryside/)).toBeVisible();
    for (let i = 0; i < 16; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('18/18')).toBeVisible();
    await expect(page.getByText(/闭环 Closing/)).toBeVisible();

    // Back to the page: the pack is listed; Export downloads its JSON.
    await openNewStudy(page);
    const row = page.getByTestId('pack-row').first();
    await expect(row).toContainText('祂必兴旺，我必衰微');
    const download = page.waitForEvent('download');
    await row.getByRole('button', { name: NS_EXPORT }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`${PACK_ID}.json`);
    const body = await (await file.createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(body).toString('utf-8')) as { id: string; enVersion: string };
    expect(json.id).toBe(PACK_ID);
    expect(json.enVersion).toBe('BSB');
  });

  test('editor: change the range to John 3:22–30 without regenerating, move a section, remove one with inline confirm → Preview order', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON));
    let modelCalls = 0;
    page.on('request', r => { if (r.url() === OPENROUTER_CHAT_URL) modelCalls++; });
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    const editor = page.getByTestId('new-study-editor');
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    const section = (kind: string) => editor.locator(`[data-testid="ns-section"][data-kind="${kind}"]`);
    const contextBefore = await section('context').locator('textarea').inputValue();
    expect(contextBefore).toContain('约翰的门徒为施洗的事起了争论');

    // Range → 3:22–30 from the bundled text: 9 verses (v.31 gone), scripture heading + title updated, no model call.
    await expect(page.getByTestId('ns-range-verse-to')).toHaveValue('36');
    expect((await page.getByTestId('ns-range-apply').boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await page.getByTestId('ns-range-verse-to').selectOption('30');
    await page.getByTestId('ns-range-apply').click();
    await expect(page.getByTestId('ns-range-status')).toHaveText(NS_RANGE_UPDATED);
    const scripture = editor.getByTestId('ns-scripture');
    await expect(scripture).toContainText('约翰福音 3:22–30');
    await expect(scripture.getByText(/他必兴旺，我必衰微/)).toBeVisible();
    await expect(scripture.getByText(/从天上来的是在万有之上/)).toHaveCount(0);
    expect(await section('context').locator('textarea').inputValue()).toBe(contextBefore);
    expect(modelCalls).toBe(1);

    // Move 讨论 below 生活应用; remove 原文 after the inline confirm (no window.confirm).
    page.on('dialog', d => { throw new Error(`unexpected dialog: ${d.message()}`); });
    expect((await section('discussion').getByTestId('ns-section-down').boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await section('discussion').getByTestId('ns-section-down').click();
    await section('originalLanguage').getByTestId('ns-section-remove').click();
    await expect(section('originalLanguage').getByText(NS_SECTION_REMOVE_CONFIRM)).toBeVisible();
    await section('originalLanguage').getByTestId('ns-section-remove-yes').click();
    await expect(section('originalLanguage')).toHaveCount(0);
    expect(await editor.locator('[data-testid="ns-section"]').evaluateAll(els => els.map(e => e.getAttribute('data-kind'))))
      .toEqual(['title', 'scripture', 'context', 'crossRefs', 'lifeMenu', 'discussion', 'reflection', 'qr', 'closing']);

    // Preview: 15 slides (1 + 3 scripture + context + crossRefs + lifeMenu + 5 questions + reflection + qr + closing).
    await page.getByTestId('ns-preview').click();
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('祂必兴旺，我必衰微 He Must Increase')).toBeVisible();
    await expect(page.getByText('约翰福音 3:22–30 · John 3:22–30')).toBeVisible();
    await expect(page.getByText('1/15')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture — 约翰福音 3:22–30 John · 1\/3/)).toBeVisible();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('5/15')).toBeVisible();
    await expect(page.getByText(/^背景 Context/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/^交叉经文 Cross-references/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/^生活应用 Life Menu/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/讨论 Discussion · 1\/5/)).toBeVisible();
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('15/15')).toBeVisible();
    await expect(page.getByText(/闭环 Closing/)).toBeVisible();
  });

  test('a reply cut by max_tokens (finish_reason "length") is continued once — the joined JSON opens the editor', async ({ page }) => {
    await injectApiKey(page);
    const CUT = 900;
    const head = JOHN3_REPLY_JSON.slice(0, CUT);
    const tail = JOHN3_REPLY_JSON.slice(CUT);
    const model = 'anthropic/claude-sonnet-4.5';
    const reply = (text: string, finish: 'length' | 'stop') => sseBody([
      ...chunked(text).map(c => ({ model, choices: [{ delta: { content: c }, finish_reason: null }] })),
      { model, choices: [{ delta: {}, finish_reason: finish }] },
    ]);
    const { bodies } = await mockOpenRouterSequence(page, [{ sse: reply(head, 'length') }, { sse: reply(tail, 'stop') }]);
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();

    const editor = page.getByTestId('new-study-editor');
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect(editor.getByText(/他必兴旺，我必衰微/).first()).toBeVisible();
    for (const area of LIFE_AREAS) await expect(editor.getByText(area, { exact: true })).toBeVisible();
    expect(bodies()).toHaveLength(2);
    const messages = bodies()[1].messages!;
    expect(messages[messages.length - 2]).toEqual({ role: 'assistant', content: head });
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: PACK_CONTINUE_PROMPT });
  });

  test('a truncated model reply shows the bilingual error with Retry — never a half-pack', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON.slice(0, 400)));
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByRole('alert')).toHaveText(NS_ERR_NO_JSON);
    await expect(page.getByRole('button', { name: NS_RETRY })).toBeVisible();
    await expect(page.getByTestId('new-study-editor')).toHaveCount(0);
  });
});
