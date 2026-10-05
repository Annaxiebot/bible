/**
 * signup.spec.ts — the member sign-up + check-in pages in a real browser · 报名页端到端
 *
 * The demo sample pack shows the no-sign-up line; an unclaimed LOCAL pack
 * (seeded into IndexedDB) shows the sign-in block. Served as an owned pack
 * (leaderId routed in), #/signup/<id> renders the commitment step first
 * (the seven life-menu practices as large multi-select choices; any number,
 * kept in tap order), then the Chinese-first
 * contact form; an empty submit shows the name error and sends nothing; a
 * submit without an email (phone only) shows the email error and sends nothing; a
 * valid submit POSTs to PostgREST (mocked at the network level through the
 * dev-only window.__SUPABASE_E2E__ override), asks the edge function for
 * the welcome email, and the thank-you restates the commitment with the
 * personal check-in link; three chosen practices all reach the insert
 * (practices + the legacy first two) and the thank-you; a rejected insert
 * is surfaced. The same email signing up twice for a pack: the second
 * thank-you says the earlier sign-up was updated, and the leader home
 * counts that person once (the check-in page: checkin.spec.ts). A signed-out member phone with
 * an empty IndexedDB loads a leader's local- pack through the mocked
 * public_signup_pack RPC and its insert carries that leader. No live Supabase.
 */
import { test, expect, Page } from '@playwright/test';
import { SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import { signupHash } from '../../components/signup/signupRoute';
import { checkinHash } from '../../components/checkin/checkinRoute';
import {
  SU_TITLE, SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT, SU_SUBMIT, SU_ERR_NAME, SU_ERR_EMAIL_REQUIRED, SU_ERR_SUBMIT, SU_THANKS, SU_NEXT,
  SU_DEMO_LINE, SU_UNCLAIMED_LINE, SU_SIGN_IN_GOOGLE, SU_PRACTICE_TITLE, SU_ERR_PRACTICE, SU_NEXT_STEP, commitmentLine,
  SU_ERR_PACK, SU_PACK_ASK_LEADER, SU_REPLACED,
} from '../../components/signup/signupStrings';
import { CHECKIN_ANSWERS_TABLE } from '../../components/signup/signupSchema';
import { LEADER_HOME_HASH } from '../../components/leader/leaderRoute';
import { packCountsLine } from '../../components/leader/leaderStrings';
import { fakeLeaderSession } from './helpers/leader';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../../components/setup/setupStrings';
import {
  routeOwnedSamplePack, E2E_LEADER_ID, E2E_SUPABASE_PATH, seedLocalPack, fetchSamplePack, mockBackend,
  OK_INSERT as okInsert, BackendMocks as Mocks, mockSignupPackRpc, E2E_CHECKIN_NOTE,
} from './helpers/signup';

const LOCAL_ID = 'local-2026-10-02-matt6';
/** A Google Form an old pack may still carry (the feature was removed 2026-10-05); nothing may link to it. */
const OLD_FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSd_e2e/viewform';

async function openSignup(page: Page, reply = okInsert, owned = true): Promise<Mocks> {
  if (owned) await routeOwnedSamplePack(page);
  const mocks = await mockBackend(page, reply);
  await page.goto(`./${signupHash(SAMPLE_PACK_ID)}`);
  await expect(page.getByTestId('signup-page')).toBeVisible();
  return mocks;
}

/** Step 1 → step 2 with the first practice chosen. */
async function choosePractice(page: Page, index = 0) {
  await page.getByTestId('su-practice').nth(index).click();
  await page.getByTestId('su-next').click();
  await expect(page.getByTestId('su-name')).toBeVisible();
}

test.describe('Sign-up page', () => {
  test('the demo sample pack (no leaderId) shows the bilingual no-sign-up line and no form', async ({ page }) => {
    await openSignup(page, okInsert, false);
    await expect(page.getByTestId('signup-pack')).toContainText('不要忧虑');
    await expect(page.getByTestId('signup-demo')).toHaveText(SU_DEMO_LINE);
    await expect(page.getByTestId('signup-form')).toHaveCount(0);
  });

  test('an unclaimed LOCAL pack shows "sign in to enable sign-up" with the Google button instead of the demo line', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    await seedLocalPack(page, { ...sample, id: LOCAL_ID });
    await page.goto(`./${signupHash(LOCAL_ID)}`);
    await expect(page.getByTestId('qr-unclaimed')).toContainText(SU_UNCLAIMED_LINE);
    await expect(page.getByTestId('signup-demo')).toHaveCount(0);
    await expect(page.getByTestId('signup-form')).toHaveCount(0);
    // Without VITE_SUPABASE_* the button cannot exist (nothing to sign in to); the config error shows in its place.
    await expect(page.getByRole('button', { name: SU_SIGN_IN_GOOGLE })).toHaveCount(0);
  });

  test('step 1 is the commitment: the seven practices as large choices, Next gated on a choice; step 2 the Chinese-first contact form', async ({ page }) => {
    await openSignup(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(SU_TITLE);
    const pack = await fetchSamplePack(page);
    await expect(page.getByTestId('signup-pack')).toContainText(String(pack.title));
    await expect(page.getByText(SU_PRACTICE_TITLE)).toBeVisible();
    const choices = page.getByTestId('su-practice');
    await expect(choices).toHaveCount(7);
    expect((await choices.first().boundingBox())!.height).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
    await page.getByTestId('su-next').click();
    await expect(page.getByRole('alert')).toHaveText(SU_ERR_PRACTICE);
    await choices.first().click();
    await expect(choices.first()).toHaveAttribute('data-chosen', '1');
    await expect(choices.first()).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: SU_NEXT_STEP }).click();
    for (const label of [SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT]) {
      expect(label).toMatch(/^[一-鿿]/);  // Chinese first (ADR-0003 §1)
      await expect(page.getByText(label)).toBeVisible();
    }
    const fontSize = await page.getByTestId('su-name').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(SETUP_MIN_FONT_PX);
    expect((await page.getByTestId('su-submit').boundingBox())!.height).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
    await expect(page.getByTestId('su-consent')).toBeChecked();
  });

  test('an empty submit shows the bilingual name error and sends nothing', async ({ page }) => {
    const { bodies } = await openSignup(page);
    await choosePractice(page);
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByRole('alert')).toHaveText(SU_ERR_NAME);
    expect(bodies()).toHaveLength(0);
  });

  test('email is required: name + phone but no email shows the bilingual email error and inserts nothing', async ({ page }) => {
    const { bodies, welcomes } = await openSignup(page);
    await choosePractice(page);
    await expect(page.getByTestId('su-email')).toHaveAttribute('required', '');
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-phone').fill('(408) 555-1234');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByRole('alert')).toHaveText(SU_ERR_EMAIL_REQUIRED);
    await expect(page.getByTestId('signup-thanks')).toHaveCount(0);
    expect(bodies()).toHaveLength(0);
    expect(welcomes()).toHaveLength(0);
  });

  test('a valid submit inserts the commitment through the anon client, asks for the welcome, and the thank-you restates it with the check-in link', async ({ page }) => {
    const { bodies, welcomes } = await openSignup(page);
    const practiceText = (await page.getByTestId('su-practice').first().getAttribute('data-area'))!;
    await choosePractice(page);
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByTestId('su-phone').fill('(408) 555-1234');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    const thanks = page.getByTestId('signup-thanks');
    await expect(thanks).toContainText(SU_THANKS);
    await expect(thanks).toContainText(SU_NEXT);
    await expect(page.getByTestId('signup-form')).toHaveCount(0);
    expect(bodies()).toHaveLength(1);
    expect(bodies()[0]).toMatchObject({
      pack_id: SAMPLE_PACK_ID, leader_id: E2E_LEADER_ID, name: '小明', email: 'ming@example.org', phone: '4085551234',
      consent_checkins: true, practice_area: practiceText, practice2_area: null, practice_note: null,
    });
    expect(bodies()[0].practices).toEqual([{ area: practiceText, practice: bodies()[0].practice_text }]);
    const practiceTextSent = bodies()[0].practice_text ?? '';
    expect(practiceTextSent.length).toBeGreaterThan(0);
    await expect(page.getByTestId('signup-commitment')).toHaveText(commitmentLine(practiceTextSent));
    // The browser makes the id (anon cannot read the row back); link and welcome use that same id.
    const id = bodies()[0].id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await expect(page.getByTestId('signup-checkin-link')).toHaveAttribute('href', new RegExp(`${checkinHash(id)}$`));
    await expect.poll(() => welcomes().length).toBe(1);
    expect(welcomes()[0]).toEqual({ kind: 'welcome', signup_id: id });
  });

  test('three practices + an own version: the insert carries all three in practices (tap order) and the first two in the legacy columns; the thank-you lists all three, then the own version', async ({ page }) => {
    const { bodies } = await openSignup(page);
    const choices = page.getByTestId('su-practice');
    for (const i of [4, 1, 6]) await choices.nth(i).click();
    await expect(choices.nth(4)).toHaveAttribute('data-chosen', '1');
    await expect(choices.nth(6)).toHaveAttribute('data-chosen', '3');
    await page.getByTestId('su-note').fill(E2E_CHECKIN_NOTE);
    await page.getByTestId('su-next').click();
    await expect(page.getByTestId('su-own-version')).toHaveText(`我的版本 · My own version：${E2E_CHECKIN_NOTE}`);
    await expect(page.getByTestId('su-commitment')).toHaveCount(3);
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    const pack = await fetchSamplePack(page);
    const menu = (pack.sections as { kind: string; rows?: { area: string; practice: string }[] }[]).find(s => s.kind === 'lifeMenu')!.rows!;
    const chosen = [menu[4], menu[1], menu[6]].map(r => ({ area: r.area, practice: r.practice }));
    expect(bodies()).toHaveLength(1);
    expect(bodies()[0]).toMatchObject({
      practices: chosen,
      practice_area: chosen[0].area, practice_text: chosen[0].practice, practice2_area: chosen[1].area, practice2_text: chosen[1].practice,
    });
    // Every chosen practice keeps its own text; the own version is an extra labelled line (never replaces the first).
    await expect(page.getByTestId('signup-commitment')).toHaveText(chosen.map(c => commitmentLine(c.practice)));
    await expect(page.getByTestId('signup-own-version')).toHaveText(`我的版本 · My own version：${E2E_CHECKIN_NOTE}`);
    expect(bodies()[0].practice_note).toBe(E2E_CHECKIN_NOTE);
  });

  test('an old owned pack that still carries a Google Form renders, and the thank-you link is the built-in check-in page', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    const mocks = await mockBackend(page, okInsert);
    await seedLocalPack(page, { ...sample, id: LOCAL_ID, leaderId: E2E_LEADER_ID, feedbackFormUrl: OLD_FORM, feedbackFormEntries: { name: 'entry.1', practice: 'entry.2' } });
    await page.goto(`./${signupHash(LOCAL_ID)}`);
    await choosePractice(page);
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    const href = (await page.getByTestId('signup-checkin-link').getAttribute('href'))!;
    expect(href.endsWith(checkinHash(mocks.bodies()[0].id))).toBe(true);
    expect(await page.content()).not.toContain('docs.google.com');
  });

  test('a signed-out member phone with an empty IndexedDB loads a leader pack from public_signup_pack and signs up under its leader', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    const lifeMenu = (sample.sections as { kind: string; rows?: unknown[] }[]).find(s => s.kind === 'lifeMenu')!.rows!;
    const { bodies } = await mockBackend(page, okInsert);
    const rpcCalls = await mockSignupPackRpc(page, {
      id: LOCAL_ID, title: sample.title, passageRef: sample.passageRef, leaderId: E2E_LEADER_ID,
      lifeMenu,
    });
    await page.goto(`./${signupHash(LOCAL_ID)}`);
    await expect(page.getByTestId('signup-pack')).toContainText(String(sample.title));
    await expect(page.getByTestId('su-practice')).toHaveCount(7);
    // Dev StrictMode runs the load effect twice; every call asks for this pack only.
    expect(rpcCalls().length).toBeGreaterThan(0);
    for (const call of rpcCalls()) expect(call).toEqual({ p_pack_id: LOCAL_ID });
    await choosePractice(page);
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    expect(bodies()).toHaveLength(1);
    expect(bodies()[0]).toMatchObject({ pack_id: LOCAL_ID, leader_id: E2E_LEADER_ID, pack_title: sample.title });
  });

  test('the same person signing up twice (same pack, email differing only in case/spaces): the second replaces the first; the leader home counts one', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    const mocks = await mockBackend(page, okInsert);
    await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${CHECKIN_ANSWERS_TABLE}**`, route =>
      route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' }));
    await seedLocalPack(page, { ...sample, id: LOCAL_ID, leaderId: E2E_LEADER_ID });
    for (const [email, practice] of [[' Ming@Example.org ', 0], ['ming@example.org', 2]] as const) {
      await page.goto(`./${signupHash(LOCAL_ID)}`);
      await page.reload();   // a fresh form each time (the hash may not change between rounds)
      await choosePractice(page, practice);
      await page.getByTestId('su-name').fill('小明');
      await page.getByTestId('su-email').fill(email);
      await page.getByRole('button', { name: SU_SUBMIT }).click();
      await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    }
    // The second thank-you says so; the RPC got only the id the browser just made.
    await expect(page.getByTestId('signup-replaced')).toHaveText(SU_REPLACED);
    expect(mocks.replaces()).toEqual(mocks.bodies().map(b => ({ p_new_id: b.id })));
    expect(mocks.rows().map(r => Boolean(r.replaced_at))).toEqual([true, false]);

    await fakeLeaderSession(page);
    await page.goto(`./${LEADER_HOME_HASH}`);
    await page.reload();   // a hash change is not a navigation: reload so the session seam's init script runs
    await expect(page.getByTestId('lh-pack').getByTestId('lh-counts')).toHaveText(packCountsLine(1, 0));
  });

  test('a leader pack the server does not have shows the not-found line with "ask your leader", no form', async ({ page }) => {
    await mockBackend(page, okInsert);
    await mockSignupPackRpc(page, null);
    await page.goto(`./${signupHash(LOCAL_ID)}`);
    await expect(page.getByRole('alert')).toContainText(`${SU_ERR_PACK}: ${SU_PACK_ASK_LEADER}`);
    await expect(page.getByTestId('signup-form')).toHaveCount(0);
  });

  test('a rejected insert is surfaced with the server message; the form stays', async ({ page }) => {
    await openSignup(page, { status: 403, body: JSON.stringify({ message: 'new row violates row-level security policy' }) });
    await choosePractice(page);
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByRole('alert')).toContainText(SU_ERR_SUBMIT);
    await expect(page.getByRole('alert')).toContainText('row-level security');
    await expect(page.getByTestId('signup-form')).toBeVisible();
  });
});
