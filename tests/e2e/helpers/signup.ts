/**
 * signup.ts — shared helpers for the sign-up / QR e2e specs · 报名测试辅助
 *
 * The committed sample pack is demo-only (no leaderId). Specs that need an
 * owned pack route the pack JSON fetch and add a leaderId to the real file;
 * nothing else about the pack changes. The expected QR text is derived from
 * the page's own origin + base path, as the app does.
 */
import { Page } from '@playwright/test';
import { SAMPLE_PACK_ID } from '../../../components/landing/landingRoute';
import { signupUrl } from '../../../components/signup/signupRoute';

export const E2E_LEADER_ID = '00000000-0000-4000-8000-00000000e2e1';

/** Serve the sample pack as if a leader owned it (leaderId injected into the real JSON). */
export async function routeOwnedSamplePack(page: Page) {
  await page.route(`**/packs/${SAMPLE_PACK_ID}.json**`, async route => {
    const response = await route.fetch();
    const pack = await response.json();
    return route.fulfill({ response, json: { ...pack, leaderId: E2E_LEADER_ID } });
  });
}

/** The sign-up URL the QR must encode for this page's origin and base path. */
export function expectedSignupUrl(page: Page, packId = SAMPLE_PACK_ID): string {
  const here = new URL(page.url());
  return signupUrl(packId, here.origin, here.pathname);
}
