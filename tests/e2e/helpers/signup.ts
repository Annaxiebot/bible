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

/** Same-origin fake Supabase base so PostgREST / functions calls need no CORS preflight. */
export const E2E_SUPABASE_PATH = '/e2e-supabase';
export const E2E_ANON_KEY = 'e2e-anon-key';

/** Point the signup client at the fake base (dev-only window override, components/signup/signupClient). */
export async function injectSupabaseOverride(page: Page) {
  await page.addInitScript(([path, key]) => {
    (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__ = { url: `${location.origin}${path}`, anonKey: key };
  }, [E2E_SUPABASE_PATH, E2E_ANON_KEY] as const);
}

/**
 * Seed one pack into this browser's IndexedDB (the store the app reads for
 * "local-" ids). The app must have opened its database once (any page
 * load does), so this navigates to #/new first and then writes the record.
 */
export async function seedLocalPack(page: Page, pack: Record<string, unknown> & { id: string }) {
  await page.goto('./#/new');
  await page.getByTestId('new-study-page').waitFor();
  await page.evaluate(async (record) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('BibleApp');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('studypacks', 'readwrite');
        tx.objectStore('studypacks').put({ id: record.id, pack: record, savedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, pack);
}

/** The committed sample pack's JSON, as served by this dev server. */
export async function fetchSamplePack(page: Page): Promise<Record<string, unknown>> {
  return (await page.request.get(`./packs/${SAMPLE_PACK_ID}.json`)).json();
}

/** The sign-up URL the QR must encode for this page's origin and base path. */
export function expectedSignupUrl(page: Page, packId = SAMPLE_PACK_ID): string {
  const here = new URL(page.url());
  return signupUrl(packId, here.origin, here.pathname);
}
