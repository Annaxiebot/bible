/**
 * checkin-stop.spec.ts — the member stops and resumes reminders in a real browser · 退订端到端 (ADR-0009)
 *
 * #/checkin/<uuid>/stop: one large Stop button → unsubscribe_signup →
 * confirmation + Resume → resubscribe_signup. The check-in page links to it
 * and, once stopped, shows the stopped state with Resume. RPCs are faked
 * by helpers/optout with the SQL functions' constraints. The leader roster
 * (Stop/Resume per row, pause toggle) uses the app's real Supabase client,
 * which this dev server does not configure, so it is covered by unit tests
 * only (components/leader/__tests__/LeaderOptOut.test.tsx). No live Supabase.
 */
import { test, expect } from '@playwright/test';
import { checkinHash, checkinStopHash } from '../../components/checkin/checkinRoute';
import { CK_STOP, CK_STOPPED, CK_RESUME, CK_RESUMED, CK_ERR_LOAD } from '../../components/checkin/checkinStrings';
import { UNSUBSCRIBE_FN, RESUBSCRIBE_FN } from '../../supabase/functions/send-checkins/optout';
import { E2E_SIGNUP_ID as SIGNUP_ID, mockBackend } from './helpers/signup';
import { mockOptOut } from './helpers/optout';

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000aa';

test.describe('Stop these emails', () => {
  test('the check-in page links to #/checkin/<id>/stop; Stop → confirmation → Resume → back on; the check-in page shows the state', async ({ page }) => {
    await mockBackend(page);
    const optOut = await mockOptOut(page, { [SIGNUP_ID]: null });
    await page.goto(`./${checkinHash(SIGNUP_ID, 'tue')}`);
    const link = page.getByTestId('checkin-stop-link');
    await expect(link).toHaveText(CK_STOP);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${checkinStopHash(SIGNUP_ID)}$`));

    const stop = page.getByRole('button', { name: CK_STOP });
    expect((await stop.boundingBox())!.height).toBeGreaterThanOrEqual(48);   // one large button
    await stop.click();
    await expect(page.getByTestId('stop-done')).toHaveText(CK_STOPPED);
    expect(optOut.stoppedAt(SIGNUP_ID)).toBeTruthy();

    // Back on the check-in page the stopped state shows, with Resume.
    await page.goto(`./${checkinHash(SIGNUP_ID, 'tue')}`);
    await expect(page.getByTestId('checkin-stopped')).toContainText(CK_STOPPED);
    await page.goto(`./${checkinStopHash(SIGNUP_ID)}`);
    await page.getByRole('button', { name: CK_STOP }).click();   // stopping twice is harmless (idempotent)
    await page.getByRole('button', { name: CK_RESUME }).click();
    await expect(page.getByTestId('stop-resumed')).toHaveText(CK_RESUMED);
    expect(optOut.stoppedAt(SIGNUP_ID)).toBeNull();
    expect(optOut.calls().map(c => c.fn)).toEqual([UNSUBSCRIBE_FN, UNSUBSCRIBE_FN, RESUBSCRIBE_FN]);
    expect(optOut.calls().every(c => JSON.stringify(c.args) === JSON.stringify({ p_id: SIGNUP_ID }))).toBe(true);
  });

  test('Resume from the check-in page itself brings the stop link back', async ({ page }) => {
    await mockBackend(page);
    const optOut = await mockOptOut(page, { [SIGNUP_ID]: '2026-10-04T16:00:00Z' });
    await page.goto(`./${checkinHash(SIGNUP_ID, 'thu')}`);
    await page.getByTestId('checkin-stopped').getByRole('button', { name: CK_RESUME }).click();
    await expect(page.getByTestId('checkin-stop-link')).toBeVisible();
    expect(optOut.stoppedAt(SIGNUP_ID)).toBeNull();
  });

  test('an unknown link never shows a false confirmation', async ({ page }) => {
    await mockBackend(page);
    await mockOptOut(page, { [SIGNUP_ID]: null });
    await page.goto(`./${checkinStopHash(UNKNOWN_ID)}`);
    await page.getByRole('button', { name: CK_STOP }).click();
    await expect(page.getByRole('alert')).toHaveText(CK_ERR_LOAD);
    await expect(page.getByTestId('stop-done')).toHaveCount(0);
  });
});
