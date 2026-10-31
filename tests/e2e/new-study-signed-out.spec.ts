/**
 * new-study-signed-out.spec.ts — New study before sign-in · 未登录的新建查经 (owner decision D)
 *
 * A first-time visitor (no packs in this browser) sees only the three-step
 * card and the sign-in card — no "我的查经包 My packs", no "备份与恢复 Backup &
 * restore", no pack line. A browser that already holds packs keeps My packs
 * and Backup & restore (it is their only copy) with one line asking to sign
 * in to keep them in the account. No live Supabase.
 */
import { test, expect } from '@playwright/test';
import {
  NS_GUIDE_TITLE, NS_MY_PACKS, NS_BACKUP_TOGGLE, NS_PRIVACY, NS_SIGN_IN_TO_KEEP,
} from '../../components/newstudy/newStudyStrings';
import { SETUP_SIGN_IN_TO_USE_AI } from '../../components/setup/setupStrings';
import { seedLocalPack, fetchSamplePack } from './helpers/signup';
import { openNewStudy } from './helpers/newStudy';

test.describe('New study, signed out', () => {
  test('no packs in this browser: only the three-step card and the sign-in card', async ({ page }) => {
    await openNewStudy(page);
    await expect(page.getByText(NS_GUIDE_TITLE)).toBeVisible();
    await expect(page.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();
    await expect(page.getByTestId('new-study-form')).toHaveCount(0);
    await expect(page.getByText(NS_MY_PACKS)).toHaveCount(0);
    await expect(page.getByText(NS_BACKUP_TOGGLE)).toHaveCount(0);
    await expect(page.getByText(NS_PRIVACY)).toHaveCount(0);
  });

  test('packs in this browser: My packs and Backup & restore stay, with "sign in to keep them in your account"', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    await seedLocalPack(page, { ...sample, id: 'local-2026-10-23-matt6', title: '不要忧虑 Do Not Worry', date: '2026-10-23' });
    await openNewStudy(page);
    await page.reload();
    await expect(page.getByText(NS_MY_PACKS)).toBeVisible();
    await expect(page.getByTestId('pack-list-sign-in')).toHaveText(NS_SIGN_IN_TO_KEEP);
    await expect(page.getByTestId('pack-row')).toHaveCount(1);
    await expect(page.getByRole('button', { name: NS_BACKUP_TOGGLE })).toBeVisible();
    await expect(page.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();
    await expect(page.getByText(NS_GUIDE_TITLE)).toHaveCount(0);   // the first-time card is for browsers with no packs
  });
});
