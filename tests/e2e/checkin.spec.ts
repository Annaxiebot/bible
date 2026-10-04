/**
 * checkin.spec.ts — the member's check-in page in a real browser · 跟进页端到端
 *
 * #/checkin/<uuid>/<kind> (checkin_context mocked by helpers/signup
 * mockBackend) renders every chosen practice with its own text, the own
 * version as an extra labelled line, the kind's question with the kind
 * named once (in the heading), and the two buttons; Keep private never
 * touches the network; Share calls the RPC. Split out of signup.spec.ts
 * (file budget). No live Supabase.
 */
import { test, expect } from '@playwright/test';
import { checkinHash } from '../../components/checkin/checkinRoute';
import {
  CK_TITLE, CK_KEEP_PRIVATE, CK_SHARE, CK_KEPT, CK_SHARED, CK_KIND_LABEL, CK_QUESTION_LABEL,
} from '../../components/checkin/checkinStrings';
import {
  E2E_SIGNUP_ID as SIGNUP_ID, E2E_SUPABASE_PATH, mockBackend, OK_INSERT as okInsert, E2E_CHECKIN_PRACTICES, E2E_CHECKIN_NOTE,
} from './helpers/signup';

test.describe('Check-in page', () => {
  test('#/checkin/<uuid>/tue renders the practice, the Tuesday question and the two buttons; Keep private sends nothing; Share calls the RPC', async ({ page }) => {
    const { shares } = await mockBackend(page, okInsert);
    const requests: string[] = [];
    page.on('request', r => { if (r.url().includes(E2E_SUPABASE_PATH)) requests.push(r.url()); });
    await page.goto(`./${checkinHash(SIGNUP_ID, 'tue')}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(CK_TITLE);
    await expect(page.getByTestId('checkin-practice')).toContainText('固定的睡前程序 · Fixed wind-down');
    await expect(page.getByTestId('checkin-practice-item')).toHaveCount(E2E_CHECKIN_PRACTICES.length);   // every chosen practice
    await expect(page.getByTestId('checkin-practice')).toContainText(E2E_CHECKIN_PRACTICES[1].practice);
    await expect(page.getByTestId('checkin-question')).toContainText(CK_KIND_LABEL.tue);
    await expect(page.getByTestId('checkin-question')).toContainText('做了吗？ · did it happen?');
    await expect(page.getByTestId('checkin-question')).not.toContainText('周二跟进：');   // the kind is named once, in the heading
    // The own version is its own labelled line; the chosen practices keep their text.
    await expect(page.getByTestId('checkin-own-version')).toHaveText(`我的版本 · My own version：${E2E_CHECKIN_NOTE}`);
    await expect(page.getByTestId('checkin-practice-item').first()).toContainText(E2E_CHECKIN_PRACTICES[0].practice);
    await expect(page.getByRole('button', { name: CK_KEEP_PRIVATE })).toBeVisible();
    await expect(page.getByRole('button', { name: CK_SHARE })).toBeVisible();

    await page.getByTestId('checkin-answer').fill('做了两晚 · Two nights');
    const before = requests.length;
    await page.getByRole('button', { name: CK_KEEP_PRIVATE }).click();
    await expect(page.getByTestId('checkin-done')).toHaveText(CK_KEPT);
    expect(requests.length).toBe(before);   // nothing left the phone
    expect(await page.evaluate(id => localStorage.getItem(`checkin:${id}:tue`), SIGNUP_ID)).toBe('做了两晚 · Two nights');

    await page.getByRole('button', { name: CK_SHARE }).click();
    await expect(page.getByTestId('checkin-done')).toHaveText(CK_SHARED);
    expect(shares()).toEqual([{ p_signup_id: SIGNUP_ID, p_kind: 'tue', p_answer: '做了两晚 · Two nights' }]);
  });

  test('#/checkin/<uuid>/weekend: the doubled "周末回顾：周末:" / "End of week: Weekend:" labels show once, in the heading', async ({ page }) => {
    await mockBackend(page, okInsert);
    await page.goto(`./${checkinHash(SIGNUP_ID, 'weekend')}`);
    const question = page.getByTestId('checkin-question');
    await expect(question.locator('p').first()).toHaveText(`${CK_QUESTION_LABEL} · ${CK_KIND_LABEL.weekend}`);
    await expect(question.locator('p').nth(1)).toHaveText('回顾本周… · Looking back…');
  });
});
