/**
 * signup.spec.ts — the member sign-up + check-in pages in a real browser · 报名页端到端
 *
 * The demo sample pack shows the no-sign-up line; an unclaimed LOCAL pack
 * (seeded into IndexedDB) shows the sign-in block. Served as an owned pack
 * (leaderId routed in), #/signup/<id> renders the commitment step first
 * (the seven life-menu practices as large multi-select choices; any number,
 * kept in tap order), then the Chinese-first
 * contact form; an empty submit shows the name error and sends nothing; a
 * valid submit POSTs to PostgREST (mocked at the network level through the
 * dev-only window.__SUPABASE_E2E__ override), asks the edge function for
 * the welcome email, and the thank-you restates the commitment with the
 * personal check-in link; three chosen practices all reach the insert
 * (practices + the legacy first two) and the thank-you; a rejected insert
 * is surfaced. #/checkin/<uuid> renders every practice + question and the two buttons; Keep private never
 * touches the network; Share calls the RPC. A signed-out member phone with
 * an empty IndexedDB loads a leader's local- pack through the mocked
 * public_signup_pack RPC and its insert carries that leader. No live Supabase.
 */
import { test, expect, Page } from '@playwright/test';
import { SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import { signupHash } from '../../components/signup/signupRoute';
import { checkinHash } from '../../components/checkin/checkinRoute';
import {
  SU_TITLE, SU_NAME, SU_EMAIL, SU_PHONE, SU_CONSENT, SU_SUBMIT, SU_ERR_NAME, SU_ERR_SUBMIT, SU_THANKS, SU_NEXT,
  SU_DEMO_LINE, SU_UNCLAIMED_LINE, SU_SIGN_IN_GOOGLE, SU_PRACTICE_TITLE, SU_ERR_PRACTICE, SU_NEXT_STEP, commitmentLine,
  SU_ERR_PACK, SU_PACK_ASK_LEADER,
} from '../../components/signup/signupStrings';
import {
  CK_TITLE, CK_KEEP_PRIVATE, CK_SHARE, CK_KEPT, CK_SHARED, CK_KIND_LABEL,
} from '../../components/checkin/checkinStrings';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../../components/setup/setupStrings';
import {
  routeOwnedSamplePack, E2E_LEADER_ID, E2E_SIGNUP_ID as SIGNUP_ID, E2E_SUPABASE_PATH, seedLocalPack, fetchSamplePack, mockBackend,
  OK_INSERT as okInsert, BackendMocks as Mocks, mockSignupPackRpc, E2E_CHECKIN_PRACTICES,
} from './helpers/signup';

const LOCAL_ID = 'local-2026-10-02-matt6';
const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSd_e2e/viewform';

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

  test('three practices chosen: the insert carries all three in practices (tap order) and the first two in the legacy columns; the thank-you lists all three', async ({ page }) => {
    const { bodies } = await openSignup(page);
    const choices = page.getByTestId('su-practice');
    for (const i of [4, 1, 6]) await choices.nth(i).click();
    await expect(choices.nth(4)).toHaveAttribute('data-chosen', '1');
    await expect(choices.nth(6)).toHaveAttribute('data-chosen', '3');
    await page.getByTestId('su-next').click();
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
    await expect(page.getByTestId('signup-commitment')).toHaveText(chosen.map(c => commitmentLine(c.practice)));
  });

  test('an owned pack with a Google Form: the thank-you link points at the form (prefilled with name + practice)', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    const mocks = await mockBackend(page, okInsert);
    await seedLocalPack(page, { ...sample, id: LOCAL_ID, leaderId: E2E_LEADER_ID, feedbackFormUrl: FORM, feedbackFormEntries: { name: 'entry.1', practice: 'entry.2' } });
    await page.goto(`./${signupHash(LOCAL_ID)}`);
    await choosePractice(page);
    await page.getByTestId('su-name').fill('小明');
    await page.getByTestId('su-email').fill('ming@example.org');
    await page.getByRole('button', { name: SU_SUBMIT }).click();
    await expect(page.getByTestId('signup-thanks')).toContainText(SU_THANKS);
    const href = (await page.getByTestId('signup-checkin-link').getAttribute('href'))!;
    expect(href.startsWith(`${FORM}?`)).toBe(true);
    const params = new URL(href).searchParams;
    expect(params.get('entry.1')).toBe('小明');
    expect(params.get('entry.2')).toBe(mocks.bodies()[0].practice_text);
    expect(params.get('usp')).toBe('pp_url');
  });

  test('a signed-out member phone with an empty IndexedDB loads a leader pack from public_signup_pack and signs up under its leader', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    const lifeMenu = (sample.sections as { kind: string; rows?: unknown[] }[]).find(s => s.kind === 'lifeMenu')!.rows!;
    const { bodies } = await mockBackend(page, okInsert);
    const rpcCalls = await mockSignupPackRpc(page, {
      id: LOCAL_ID, title: sample.title, passageRef: sample.passageRef, leaderId: E2E_LEADER_ID,
      lifeMenu, feedbackFormUrl: null, feedbackFormEntries: null,
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
    await expect(page.getByTestId('checkin-question')).toContainText('周二跟进：做了吗？');
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
});
