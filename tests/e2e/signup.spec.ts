/**
 * signup.spec.ts — the member sign-up page in a real browser · 报名页端到端
 *
 * The demo sample pack shows the no-sign-up line. Served as an owned pack
 * (leaderId routed in), #/signup/<id> renders the Chinese-first form with
 * the pack's title at senior-readable sizes; an empty submit shows the name error
 * and sends nothing; a valid submit POSTs to PostgREST (mocked at the
 * network level through the dev-only window.__SUPABASE_E2E__ override) and
 * shows the thank-you; a rejected insert is surfaced. No live Supabase.
 */
import { test, expect, Page } from '@playwright/test';
import { SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import { signupHash } from '../../components/signup/signupRoute';
import { SIGNUPS_TABLE, SignupInsert } from '../../components/signup/signupSchema';
import {
  SU_TITLE, SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT, SU_SUBMIT, SU_ERR_NAME, SU_ERR_SUBMIT, SU_THANKS, SU_NEXT,
  SU_DEMO_LINE,
} from '../../components/signup/signupStrings';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../../components/setup/QuickAISetup';
import { routeOwnedSamplePack, E2E_LEADER_ID } from './helpers/signup';

/** Same-origin fake Supabase base so the PostgREST call needs no CORS preflight. */
const E2E_SUPABASE_PATH = '/e2e-supabase';
const E2E_ANON_KEY = 'e2e-anon-key';

async function openSignup(
  page: Page, reply: { status: number; body: string }, owned = true,
): Promise<{ bodies: () => SignupInsert[] }> {
  const bodies: SignupInsert[] = [];
  if (owned) await routeOwnedSamplePack(page);
  await page.addInitScript(([path, key]) => {
    (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__ = { url: `${location.origin}${path}`, anonKey: key };
  }, [E2E_SUPABASE_PATH, E2E_ANON_KEY] as const);
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${SIGNUPS_TABLE}**`, route => {
    bodies.push(route.request().postDataJSON() as SignupInsert);
    return route.fulfill({ status: reply.status, headers: { 'Content-Type': 'application/json' }, body: reply.body });
  });
  await page.goto(`./${signupHash(SAMPLE_PACK_ID)}`);
  await expect(page.getByTestId('signup-page')).toBeVisible();
  return { bodies: () => bodies };
}

test.describe('Sign-up page', () => {
  test('the demo sample pack (no leaderId) shows the bilingual no-sign-up line and no form', async ({ page }) => {
    await openSignup(page, { status: 201, body: '[]' }, false);
    await expect(page.getByTestId('signup-pack')).toContainText('不要忧虑');
    await expect(page.getByTestId('signup-demo')).toHaveText(SU_DEMO_LINE);
    await expect(page.getByTestId('signup-form')).toHaveCount(0);
  });

  test('renders the Chinese-first form with the pack title, large type and ≥48px targets', async ({ page }) => {
    await openSignup(page, { status: 201, body: '[]' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SU_TITLE);
    const pack = await (await page.request.get(`./packs/${SAMPLE_PACK_ID}.json`)).json();
    await expect(page.getByTestId('signup-pack')).toContainText(pack.title);
    await expect(page.getByTestId('signup-pack')).toContainText(pack.passageRef);
    for (const label of [SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT]) {
      expect(label).toMatch(/^[\u4e00-\u9fff]/);  // Chinese first (ADR-0003 §1)
      await expect(page.getByText(label)).toBeVisible();
    }
    const fontSize = await page.getByTestId('su-name').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(SETUP_MIN_FONT_PX);
    expect((await page.getByTestId('su-submit').boundingBox())!.height).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
    await expect(page.getByTestId('su-consent')).toBeChecked();
  });

  test('an empty submit shows the bilingual name error and sends nothing', async ({ page }) => {
    const { bodies } = await openSignup(page, { status: 201, body: '[]' });
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByRole('alert')).toHaveText(SU_ERR_NAME);
    expect(bodies()).toHaveLength(0);
  });

  test('a valid submit inserts into study_signups through the anon client and shows the thank-you', async ({ page }) => {
    const { bodies } = await openSignup(page, { status: 201, body: '[]' });
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByTestId('su-phone').fill('(408) 555-1234');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_NEXT);
    await expect(page.getByTestId('signup-form')).toHaveCount(0);
    expect(bodies()).toHaveLength(1);
    expect(bodies()[0]).toMatchObject({
      pack_id: SAMPLE_PACK_ID, leader_id: E2E_LEADER_ID, name: '小明', email: 'ming@example.org', phone: '4085551234',
      consent_checkins: true,
    });
    expect(bodies()[0].pack_title).toContain('不要忧虑');
  });

  test('a rejected insert is surfaced with the server message; the form stays', async ({ page }) => {
    await openSignup(page, { status: 403, body: JSON.stringify({ message: 'new row violates row-level security policy' }) });
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByRole('alert')).toContainText(SU_ERR_SUBMIT);
    await expect(page.getByRole('alert')).toContainText('row-level security');
    await expect(page.getByTestId('signup-form')).toBeVisible();
  });
});
