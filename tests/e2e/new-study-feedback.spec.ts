/**
 * new-study-feedback.spec.ts — the feedback vehicle of a generated pack · 反馈端到端
 *
 * The built-in check-in page (#/checkin/<signupId>, Supabase) is the only
 * feedback path (Google Forms removed 2026-10-05, ADR-0004 §9): neither the
 * generation form nor the editor offers a form field, a generated pack
 * carries no form, and once the pack is owned a member's thank-you link is
 * the built-in page. No live AI call, no live Supabase.
 */
import { test, expect } from '@playwright/test';
import { NS_GENERATE, NS_EDIT_TITLE, NS_AUTOSAVED } from '../../components/newstudy/newStudyStrings';
import { JOHN3_REPLY_JSON } from '../../components/newstudy/__tests__/fixtures';
import { signupHash } from '../../components/signup/signupRoute';
import { checkinHash } from '../../components/checkin/checkinRoute';
import { SU_SUBMIT, SU_THANKS } from '../../components/signup/signupStrings';
import { injectApiKey, mockOpenRouterStream } from './helpers/tv';
import { E2E_LEADER_ID, mockBackend } from './helpers/signup';
import { PACK_ID, openNewStudy, fillJohn3, chunked } from './helpers/newStudy';

test.describe('New study: feedback vehicle', () => {
  test('no Google Form anywhere: the form and editor offer none; once owned, a member\'s thank-you link is the built-in check-in page', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterStream(page, chunked(JOHN3_REPLY_JSON));
    const mocks = await mockBackend(page);
    await openNewStudy(page);
    await fillJohn3(page);
    await expect(page.getByTestId('ns-feedback-link')).toHaveCount(0);
    await expect(page.getByTestId('ns-feedback-default')).toHaveCount(0);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();
    await expect(page.getByTestId('ns-status')).toHaveText(NS_AUTOSAVED);
    for (const id of ['ns-feedback-form', 'ns-feedback-url', 'ns-form-connect', 'ns-form-notice']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(page.getByText(/Google/)).toHaveCount(0);
    // Give the stored pack an owner (what claim-on-sign-in does) and sign a member up to it.
    const owned = await page.evaluate(async ([id, leaderId]) => new Promise<Record<string, unknown> & { id: string }>((resolve, reject) => {
      const open = indexedDB.open('BibleApp');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('studypacks', 'readwrite');
        const store = tx.objectStore('studypacks');
        const get = store.get(id);
        let pack: Record<string, unknown> & { id: string };
        get.onsuccess = () => { pack = { ...get.result.pack, leaderId }; store.put({ ...get.result, pack }); };
        tx.oncomplete = () => { open.result.close(); resolve(pack); };
        tx.onerror = () => reject(tx.error);
      };
    }), [PACK_ID, E2E_LEADER_ID] as const);
    mocks.ownPack(owned);   // the signed-in save puts it in study_packs, where the signup function reads it
    await page.goto(`./${signupHash(PACK_ID)}`);
    await page.getByTestId('su-practice').first().click();
    await page.getByTestId('su-next').click();
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    const href = (await page.getByTestId('signup-checkin-link').getAttribute('href'))!;
    expect(href.endsWith(checkinHash(mocks.rows()[0].id))).toBe(true);   // the signup function makes the id
    expect(href).not.toContain('docs.google.com');
    expect(mocks.rows()[0]).toMatchObject({ pack_id: PACK_ID, leader_id: E2E_LEADER_ID, name: '小明' });
  });
});
