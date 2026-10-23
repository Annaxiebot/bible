/**
 * emailAuth.ts — routed Supabase Auth endpoints for the email sign-in specs · 邮箱登录测试辅助 (ADR-0020)
 *
 * Under the fake Supabase base (helpers/signup): /auth/v1/otp answers
 * `otpStatus` (200, or GoTrue's rate-limit body); /auth/v1/verify accepts
 * GOOD_CODE only (anything else: otp_expired, like GoTrue) and returns a
 * session for E2E_LEADER_ID. Shared by email-sign-in.spec and funnel.spec.
 */
import { Page } from '@playwright/test';
import { E2E_SUPABASE_PATH, E2E_LEADER_ID } from './signup';

export const EMAIL = 'leader@example.org';
export const GOOD_CODE = '246810';

export interface AuthCalls { otp: Array<{ url: string; body: Record<string, unknown> }>; verify: Array<Record<string, unknown>> }

export async function routeAuth(page: Page, otpStatus = 200): Promise<AuthCalls> {
  const calls: AuthCalls = { otp: [], verify: [] };
  await page.route(`**${E2E_SUPABASE_PATH}/auth/v1/otp**`, route => {
    calls.otp.push({ url: route.request().url(), body: route.request().postDataJSON() });
    if (otpStatus === 200) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({
      status: otpStatus, contentType: 'application/json',
      body: JSON.stringify({ code: otpStatus, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }),
    });
  });
  await page.route(`**${E2E_SUPABASE_PATH}/auth/v1/verify**`, route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.verify.push(body);
    if (body.token !== GOOD_CODE) {
      return route.fulfill({
        status: 403, contentType: 'application/json',
        body: JSON.stringify({ code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }),
      });
    }
    const now = Math.floor(Date.now() / 1000);
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-access', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'e2e-refresh',
        user: { id: E2E_LEADER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-23T00:00:00Z' },
      }),
    });
  });
  return calls;
}
