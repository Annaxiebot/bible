/**
 * new-study-feedback.spec.ts — the feedback vehicle of a generated pack · 反馈表端到端
 *
 * The built-in check-in page (#/checkin/<signupId>, Supabase) is the default
 * (ADR-0004 §9): a generated pack carries no Google Form, none is created
 * or offered without the explicit opt-in, and once the pack is owned a
 * member's thank-you link is the built-in page. A pasted Google Form link
 * on the generation form is validated, remembered as the leader's default,
 * and carried into the pack. No live AI call, no live Supabase.
 */
import { test, expect } from '@playwright/test';
import { NS_GENERATE, NS_EDIT_TITLE, NS_AUTOSAVED, NS_ERR_FEEDBACK_FORM, NS_FEEDBACK_FORM_HINT } from '../../components/newstudy/newStudyStrings';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { JOHN3_REPLY_JSON } from '../../components/newstudy/__tests__/fixtures';
import { signupHash } from '../../components/signup/signupRoute';
import { checkinHash } from '../../components/checkin/checkinRoute';
import { SU_SUBMIT, SU_THANKS } from '../../components/signup/signupStrings';
import { injectApiKey, mockOpenRouterStream } from './helpers/tv';
import { E2E_LEADER_ID, mockBackend } from './helpers/signup';
import { PACK_ID, openNewStudy, fillJohn3, chunked } from './helpers/newStudy';

test.describe('New study: feedback vehicle', () => {
  test('a Google Form link on the generation form is validated, remembered as the default, and carried into the pack', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON));
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByTestId('ns-feedback-link').fill('https://example.com/not-a-form');
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByRole('alert')).toHaveText(NS_ERR_FEEDBACK_FORM);
    const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSd_e2e/viewform';
    await page.getByTestId('ns-feedback-link').fill(FORM);
    await page.getByTestId('ns-feedback-default').check();
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect(page.getByTestId('ns-feedback-url')).toHaveValue(FORM);
    expect(await page.evaluate(k => localStorage.getItem(k), STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL)).toBe(FORM);
    // The stored pack carries the link; a fresh generation form is pre-filled with the default.
    await expect.poll(() => page.evaluate(async (id) => new Promise<string | undefined>((resolve, reject) => {
      const open = indexedDB.open('BibleApp');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const get = open.result.transaction('studypacks').objectStore('studypacks').get(id);
        get.onsuccess = () => { open.result.close(); resolve((get.result?.pack as { feedbackFormUrl?: string } | undefined)?.feedbackFormUrl); };
        get.onerror = () => reject(get.error);
      };
    }), PACK_ID)).toBe(FORM);
    await openNewStudy(page);
    await expect(page.getByTestId('ns-feedback-link')).toHaveValue(FORM);
    await expect(page.getByTestId('ns-feedback-default')).toBeChecked();
  });

  test('by default a generated pack has no Google Form and offers none; once owned, a member\'s thank-you link is the built-in check-in page', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON));
    const mocks = await mockBackend(page);
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect(page.getByTestId('ns-status')).toHaveText(NS_AUTOSAVED);
    // Nothing was created, nothing is offered (no Supabase sign-in here), no notice of any kind.
    await expect(page.getByTestId('ns-feedback-url')).toHaveValue('');
    await expect(page.getByTestId('ns-form-connect')).toHaveCount(0);
    await expect(page.getByTestId('ns-form-notice')).toHaveCount(0);
    await expect(page.getByText(NS_FEEDBACK_FORM_HINT)).toBeVisible();
    // Give the stored pack an owner (what claim-on-sign-in does) and sign a member up to it.
    await page.evaluate(async ([id, leaderId]) => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('BibleApp');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('studypacks', 'readwrite');
        const store = tx.objectStore('studypacks');
        const get = store.get(id);
        get.onsuccess = () => { store.put({ ...get.result, pack: { ...get.result.pack, leaderId } }); };
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    }), [PACK_ID, E2E_LEADER_ID] as const);
    await page.goto(`./${signupHash(PACK_ID)}`);
    await page.getByTestId('su-practice').first().click();
    await page.getByTestId('su-next').click();
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    const href = (await page.getByTestId('signup-checkin-link').getAttribute('href'))!;
    expect(href.endsWith(checkinHash(mocks.bodies()[0].id))).toBe(true);   // the browser makes the id (anon cannot read the row back)
    expect(href).not.toContain('docs.google.com');
    expect(mocks.bodies()[0]).toMatchObject({ pack_id: PACK_ID, leader_id: E2E_LEADER_ID, name: '小明' });
  });
});
