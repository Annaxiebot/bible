/**
 * new-study.spec.ts — "新建查经 New study" in a real browser · 新建查经端到端
 *
 * #/new renders the form Chinese-first (large type, ≥48px targets); with the
 * OpenRouter endpoint mocked to stream a valid pack JSON, generating
 * John 3:22–36 yields an editor holding the real bundled verses; the pack
 * is auto-saved the moment it appears (never lost), the URL becomes
 * #/new/<id>; Save then Preview opens TV mode from IndexedDB showing
 * 和合本|BSB verses and 18 slides in full screen; Escape leaves full screen, the next returns to the editor;
 * reloading #/new/<id> restores it; Export downloads the pack JSON. No
 * live AI call is made. The feedback-form tests live in
 * new-study-feedback.spec.ts, the content-language flow in
 * new-study-language.spec.ts; shared steps in helpers/newStudy.ts.
 */
import { test, expect } from '@playwright/test';
import { NEW_STUDY_LINE } from '../../components/landing/landingStrings';
import { SETUP_TITLE, SETUP_SIGN_IN_TO_USE_AI } from '../../components/setup/setupStrings';
import {
  NS_TITLE, NS_BOOK, NS_GENERATE, NS_EDIT_TITLE, NS_SAVE, NS_SAVED, NS_AUTOSAVED, NS_PREVIEW, NS_BACKUP_TOGGLE, NS_BACKUP_DOWNLOAD, NS_MY_PACKS, NS_EDIT,
  NS_SCRIPTURE_NOTE, NS_RETRY, NS_ERR_NO_JSON, NS_RANGE_UPDATED, NS_SECTION_REMOVE_CONFIRM,
  NS_CONTENT_LANGUAGE, NS_CONTENT_LANGUAGE_OPTIONS,
} from '../../components/newstudy/newStudyStrings';
import { newStudyHash } from '../../components/landing/landingRoute';
import { ESCAPE_GRACE_MS } from '../../components/studypack/useTVFullscreen';
import { PACK_CONTINUE_PROMPT } from '../../components/newstudy/packPrompt';
import { JOHN3_REPLY_JSON } from '../../components/newstudy/__tests__/fixtures';
import { LIFE_AREAS, DEFAULT_CONTENT_LANGUAGE } from '../../components/studypack/principles';
import { injectApiKey, mockOpenRouterStream, mockOpenRouterSequence, sseBody, OPENROUTER_CHAT_URL } from './helpers/tv';
import { PACK_ID, openNewStudy, fillJohn3, chunked, openMoreOptions } from './helpers/newStudy';

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
    await expect(page.getByTestId('ns-book')).toHaveValue('MRK'); // no pack yet → the first study, Mark 1:1–15
    await expect(page.getByTestId('ns-book').locator('option', { hasText: '约翰福音 John' })).toHaveCount(1);
    expect(await page.getByTestId('ns-book').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    expect((await page.getByTestId('ns-generate').boundingBox())!.height).toBeGreaterThanOrEqual(48);
    // Chapter and verses are native dropdowns driven by real data (Mark: 16 chapters; 1:1–15 default, 45 verses).
    for (const id of ['ns-chapter', 'ns-verse-from', 'ns-verse-to']) {
      const select = page.getByTestId(id);
      await expect(select).toHaveJSProperty('tagName', 'SELECT');
      expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      expect(await select.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    }
    await expect(page.getByTestId('ns-chapter').locator('option')).toHaveCount(16);
    await expect(page.getByTestId('ns-verse-to').locator('option')).toHaveCount(45);
    await expect(page.getByTestId('ns-verse-from')).toHaveValue('1');
    await expect(page.getByTestId('ns-verse-to')).toHaveValue('15');
    // 内容语言 Content language: a large native select, defaulting to 中文为主 (Chinese with English keywords).
    // The optional fields start folded (really hidden — the first fold never hid), then open on one click.
    await expect(page.getByTestId('ns-content-language')).toBeHidden();
    await openMoreOptions(page);
    await expect(form.getByText(NS_CONTENT_LANGUAGE)).toBeVisible();
    const language = page.getByTestId('ns-content-language');
    await expect(language).toHaveJSProperty('tagName', 'SELECT');
    await expect(language).toHaveValue(DEFAULT_CONTENT_LANGUAGE);
    await expect(language.locator('option').first()).toHaveText(NS_CONTENT_LANGUAGE_OPTIONS['zh-keywords']);
    await expect(language.locator('option').first()).toHaveText(/^中文为主/);
    await expect(language.locator('option')).toHaveCount(3);
    expect((await language.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    expect(await language.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
    await expect(page.getByText(NS_MY_PACKS)).toBeVisible();
  });

  test('without a key, signed out: the sign-in prompt renders inline instead of the form — no key hints', async ({ page }) => {
    await openNewStudy(page);
    await expect(page.getByTestId('quick-ai-setup')).toBeVisible();
    await expect(page.getByText(SETUP_TITLE)).toBeVisible();
    await expect(page.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();
    await expect(page.getByTestId('new-study-page')).not.toContainText(/OpenRouter|密钥/);
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

    // Auto-saved before the leader presses anything: the URL already carries the pack id.
    await expect(page).toHaveURL(new RegExp(`${newStudyHash(PACK_ID)}$`));
    await expect(page.getByTestId('ns-status')).toHaveText(NS_AUTOSAVED);
    await page.getByTestId('ns-save').click();
    await expect(page.getByRole('status')).toHaveText(NS_SAVED);

    await page.getByTestId('ns-preview').click();
    await expect(page).toHaveURL(new RegExp(`#/pack/${PACK_ID}$`));
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('祂必兴旺，我必衰微 He Must Increase')).toBeVisible();
    await expect(page.getByText('1/20')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture — 约翰福音 3:22–36 John · 1\/6/)).toBeVisible();
    await expect(page.getByText('和合本 CUV', { exact: true })).toBeVisible();
    await expect(page.getByText('BSB', { exact: true })).toBeVisible();
    await expect(page.getByText(/这事以后，耶稣和门徒到了犹太地/)).toBeVisible();
    await expect(page.getByText(/Jesus and His disciples went into the Judean countryside/)).toBeVisible();
    for (let i = 0; i < 18; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('20/20')).toBeVisible();
    await expect(page.getByText(/闭环 Closing/)).toBeVisible();

    // Preview opened full screen: the first Escape only leaves full screen (the browser's),
    // the next returns to the editor that opened the preview, content intact.
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await page.waitForTimeout(ESCAPE_GRACE_MS + 100);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`${newStudyHash(PACK_ID)}$`));
    await expect(page.getByTestId('new-study-editor')).toBeVisible();
    await expect(editor.getByText(/这事以后，耶稣和门徒到了犹太地/)).toBeVisible();

    // Reload keeps the editor open (the pack comes back from IndexedDB).
    await page.reload();
    await expect(page.getByTestId('new-study-editor')).toBeVisible();
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect(editor.getByText(/他必兴旺，我必衰微/).first()).toBeVisible();

    // Back to the page: the pack is listed with Edit; "Backup & restore" downloads every study in one file.
    await openNewStudy(page);
    const row = page.getByTestId('pack-row').first();
    await expect(row).toContainText('祂必兴旺，我必衰微');
    await expect(row.getByRole('link', { name: NS_EDIT })).toHaveAttribute('href', newStudyHash(PACK_ID));
    await expect(page.getByTestId('pack-list')).not.toContainText('JSON');
    await page.getByRole('button', { name: NS_BACKUP_TOGGLE }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: NS_BACKUP_DOWNLOAD }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^scripturetolife-studies-\d{4}-\d{2}-\d{2}\.json$/);
    const body = await (await file.createReadStream()).toArray();
    const json = JSON.parse(Buffer.concat(body).toString('utf-8')) as { packs: Array<{ id: string; enVersion: string }> };
    expect(json.packs.map(p => p.id)).toContain(PACK_ID);
    expect(json.packs.find(p => p.id === PACK_ID)!.enVersion).toBe('BSB');
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

    // Preview: 17 slides (1 + 4 scripture + context + crossRefs + 2 lifeMenu (3 + 4 rows) + 5 questions + reflection + qr + closing).
    await page.getByTestId('ns-preview').click();
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('祂必兴旺，我必衰微 He Must Increase')).toBeVisible();
    await expect(page.getByText('约翰福音 3:22–30 · John 3:22–30')).toBeVisible();
    await expect(page.getByText('1/17')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture — 约翰福音 3:22–30 John · 1\/4/)).toBeVisible();
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('6/17')).toBeVisible();
    await expect(page.getByText(/^背景 Context/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/^交叉经文 Cross-references/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/^生活应用 Life Menu · 1\/2/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/^生活应用 Life Menu · 2\/2/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/讨论 Discussion · 1\/5/)).toBeVisible();
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('17/17')).toBeVisible();
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

  test('generation never loses the pack: Preview straight after generating, close TV mode → the editor is back and the pack is listed', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON));
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await page.getByTestId('ns-preview').click();   // no Save pressed
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await page.getByLabel('退出演示 Exit presentation').click();
    await expect(page.getByTestId('new-study-editor')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${newStudyHash(PACK_ID)}$`));
    await openNewStudy(page);
    await expect(page.getByTestId('pack-row').first()).toContainText('祂必兴旺，我必衰微');
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
