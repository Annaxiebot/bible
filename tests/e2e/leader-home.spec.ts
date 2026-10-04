/**
 * leader-home.spec.ts — one leader sign-in, one home · 带领者主页端到端
 *
 * Signed out, the landing nav carries "带领者登录 Leader sign-in" as a
 * ≥48px button (this dev server has no Supabase, so pressing it shows the
 * auth error instead of leaving for Google). Signed in (the dev-only
 * __LEADER_E2E__ seam), the nav shows the leader's first name linking to
 * #/leader, which lists the leader's pack with its sign-up / shared-answer
 * counts (PostgREST mocked); Edit opens the editor at #/new/<id> and
 * Present opens TV mode at #/pack/<id>; Sign-up QR opens #/qr/<id>, a
 * page that shows the pack's sign-up QR. No live Supabase.
 */
import { test, expect } from '@playwright/test';
import { NAV_LEADER_SIGNIN } from '../../components/landing/landingStrings';
import { newStudyHash, packHash } from '../../components/landing/landingRoute';
import { LEADER_HOME_HASH } from '../../components/leader/leaderRoute';
import { LH_TITLE, LH_QR, packCountsLine } from '../../components/leader/leaderStrings';
import { SETUP_MIN_TAP_PX } from '../../components/setup/setupStrings';
import { E2E_LEADER_ID, seedLocalPack, fetchSamplePack, expectedSignupUrl } from './helpers/signup';
import { qrHash } from '../../components/signup/signupRoute';
import { SU_QR_PRINT } from '../../components/signup/signupStrings';
import { fakeLeaderSession, mockLeaderCounts } from './helpers/leader';

const PACK_ID = 'local-2026-10-09-matt6';
const PACK_TITLE = '不要忧虑（主页） Do Not Worry (home)';

test.describe('Leader sign-in and home', () => {
  test('signed out: the landing nav shows the leader sign-in button; pressing it surfaces the auth error', async ({ page }) => {
    await page.goto('./');
    const button = page.getByTestId('nav-leader-signin');
    await expect(button).toHaveText(`${NAV_LEADER_SIGNIN.zh}${NAV_LEADER_SIGNIN.en}`);
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
    await expect(page.getByTestId('nav-leader')).toHaveCount(0);
    await button.click();
    await expect(page.getByTestId('nav-leader-error')).toBeVisible();
  });

  test('signed in: nav name → #/leader lists the pack with counts; Edit and Present open it', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    await seedLocalPack(page, { ...sample, id: PACK_ID, title: PACK_TITLE, date: '2026-10-09', leaderId: E2E_LEADER_ID });
    await fakeLeaderSession(page);
    // A third sign-up row for PACK_ID was replaced by a later one (same email): never counted.
    await mockLeaderCounts(page, [PACK_ID, PACK_ID, 'local-other'], [PACK_ID], [PACK_ID]);

    await page.goto('./');
    const name = page.getByTestId('nav-leader');
    await expect(name).toHaveText('Chris');
    await name.click();
    await expect(page).toHaveURL(new RegExp(`${LEADER_HOME_HASH}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(LH_TITLE);

    const row = page.getByTestId('lh-pack');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(PACK_TITLE);
    await expect(row.getByTestId('lh-counts')).toHaveText(packCountsLine(2, 1));

    await row.getByTestId('lh-edit').click();
    await expect(page).toHaveURL(new RegExp(`${newStudyHash(PACK_ID)}$`));
    await expect(page.getByTestId('ns-title')).toBeVisible();

    await page.goto(`./${LEADER_HOME_HASH}`);
    await page.getByTestId('lh-pack').getByTestId('lh-present').click();
    await expect(page).toHaveURL(new RegExp(`${packHash(PACK_ID)}$`));
    await expect(page.getByTestId('tv-presentation')).toBeVisible();

    await page.goto(`./${LEADER_HOME_HASH}`);
    const qrLink = page.getByTestId('lh-pack').getByTestId('lh-qr');
    await expect(qrLink).toHaveText(LH_QR);
    await qrLink.click();
    await expect(page).toHaveURL(new RegExp(`${qrHash(PACK_ID)}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(PACK_TITLE);
    const qr = page.getByTestId('signup-qr');
    await expect(qr).toHaveAttribute('data-signup-url', expectedSignupUrl(page, PACK_ID));
    await expect(qr.locator('svg')).toBeVisible();
    expect((await qr.boundingBox())!.width).toBeGreaterThanOrEqual(300);   // large enough to scan across a room
    await expect(page.getByTestId('qr-url')).toHaveText(expectedSignupUrl(page, PACK_ID));
    await expect(page.getByRole('button', { name: SU_QR_PRINT })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: SU_QR_PRINT })).toBeHidden();
    await expect(page.getByTestId('qr-back')).toBeHidden();
    await expect(qr).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
    await page.getByTestId('qr-back').click();
    await expect(page).toHaveURL(new RegExp(`${LEADER_HOME_HASH}$`));
  });
});
