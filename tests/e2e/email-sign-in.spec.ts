/**
 * email-sign-in.spec.ts — sign in with an email link or code, end to end · 邮箱登录端到端 (ADR-0020)
 *
 * A signed-out leader on New study (#/new) chooses "用邮箱登录 · Sign in with
 * email" beside Google, types the address and presses "发送登录链接": the real
 * supabase-js client posts to the routed Supabase Auth endpoint (the dev-only
 * __SUPABASE_E2E__ base) — the normalised address, create_user on, the link
 * landing on origin + path — and the page remembers #/new for the return.
 * The page says "已发送，请查看邮箱" (the same for any address) and waits with
 * a code box; a wrong code says so; the right code is verified as type
 * "email" and the page shows "已登录". A rate-limited send shows its line.
 * No live Supabase: the auth endpoints are routed; this dev server has no
 * real session, so the signed-in page that follows is covered by unit tests.
 */
import { test, expect, Page } from '@playwright/test';
import {
  SI_EMAIL_TOGGLE, SI_EMAIL_LABEL, SI_SEND, SI_SENT, SI_CODE_LABEL, SI_VERIFY, SI_SIGNED_IN, SI_ERR_CODE_WRONG, SI_ERR_RATE,
} from '../../components/signin/signInStrings';
import { SETUP_SIGN_IN_TO_USE_AI } from '../../components/setup/setupStrings';
import { AUTH_RETURN_HASH_KEY } from '../../services/authReturnHash';
import { injectSupabaseOverride } from './helpers/signup';
import { openNewStudy } from './helpers/newStudy';
import { routeAuth, EMAIL, GOOD_CODE } from './helpers/emailAuth';

async function startEmailSignIn(page: Page, typed: string) {
  await openNewStudy(page);
  await expect(page.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();
  const toggle = page.getByRole('button', { name: SI_EMAIL_TOGGLE });
  expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await toggle.click();
  await page.getByLabel(SI_EMAIL_LABEL).fill(typed);
  await page.getByRole('button', { name: SI_SEND }).click();
}

test.describe('Email sign-in (link + 6-digit code)', () => {
  test('send → "Sent — check your email" + code box → a wrong code says so → the right code signs in; #/new is remembered', async ({ page }) => {
    await injectSupabaseOverride(page);
    const calls = await routeAuth(page);
    await startEmailSignIn(page, '  Leader@Example.org ');

    await expect(page.getByRole('status').filter({ hasText: SI_SENT })).toBeVisible();
    expect(calls.otp).toHaveLength(1);
    expect(calls.otp[0].body).toMatchObject({ email: EMAIL, create_user: true });
    const redirect = new URL(calls.otp[0].url).searchParams.get('redirect_to');
    expect(redirect).toBe(new URL(page.url()).origin + new URL(page.url()).pathname);
    const remembered = await page.evaluate(k => localStorage.getItem(k), AUTH_RETURN_HASH_KEY);
    expect(JSON.parse(remembered!).hash).toBe('#/new');

    const code = page.getByLabel(SI_CODE_LABEL);
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    await code.fill('111111');
    await page.getByRole('button', { name: SI_VERIFY }).click();
    await expect(page.getByRole('alert')).toHaveText(SI_ERR_CODE_WRONG);

    await code.fill(GOOD_CODE);
    await page.getByRole('button', { name: SI_VERIFY }).click();
    await expect(page.getByTestId('email-sign-in-done')).toHaveText(SI_SIGNED_IN);
    expect(calls.verify.at(-1)).toMatchObject({ email: EMAIL, token: GOOD_CODE, type: 'email' });
  });

  test('a rate-limited send shows its Chinese-first line and stays on the address', async ({ page }) => {
    await injectSupabaseOverride(page);
    await routeAuth(page, 429);
    await startEmailSignIn(page, EMAIL);
    await expect(page.getByRole('alert')).toHaveText(SI_ERR_RATE);
    await expect(page.getByLabel(SI_EMAIL_LABEL)).toHaveValue(EMAIL);
    await expect(page.getByLabel(SI_CODE_LABEL)).toHaveCount(0);
  });
});
