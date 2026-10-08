/**
 * tv-presentation.spec.ts — TV presentation mode + Ask AI overlay · 大屏模式端到端
 *
 * Navigation, slide content and the Ask AI overlay (configured, mocked at
 * the network level; no key + signed out → the sign-in prompt). Cross-
 * references live in tv-cross-refs.spec.ts; 1080p fit and phone viewports
 * in tv-phone.spec.ts. Shared helpers: helpers/tv.ts.
 */
import { test, expect } from '@playwright/test';
import { FIRST_SLIDE_HINT, ASK_AI_LABEL } from '../../components/studypack/tvHints';
import { LIFE_AREAS } from '../../components/studypack/principles';
import { DEFAULT_AI_SETUP, wireModelId } from '../../services/aiDefaults';
import { SETUP_TITLE, SETUP_SIGN_IN_TO_USE_AI, SETUP_OWN_KEY_TOGGLE } from '../../components/setup/setupStrings';
import { openTV, injectApiKey, mockOpenRouterStream, DEMO_SLIDE, goToSlide } from './helpers/tv';
import QRCode from 'qrcode';
import { QR_SVG_OPTIONS, qrModulesPath } from '../../components/signup/signupRoute';
import { SU_QR_BODY, SU_DEMO_LINE, SU_UNCLAIMED_LINE } from '../../components/signup/signupStrings';
import { packHash } from '../../components/landing/landingRoute';
import { routeOwnedSamplePack, expectedSignupUrl, seedLocalPack, fetchSamplePack } from './helpers/signup';

const TOTAL = DEMO_SLIDE.total;

test.describe('TV Presentation Mode', () => {
  test('loads the pack from the URL and shows the title slide', async ({ page }) => {
    await openTV(page);
    await expect(page.getByText(`1/${TOTAL}`)).toBeVisible();
    await expect(page.getByText(FIRST_SLIDE_HINT)).toBeVisible();
  });

  test(`advances through all ${DEMO_SLIDE.total} slides with the keyboard and clamps at the end`, async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(`2/${TOTAL}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: /经文 Scripture/ })).toBeVisible();

    for (let i = 0; i < TOTAL - 2; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(`${TOTAL}/${TOTAL}`)).toBeVisible();
    await expect(page.getByText(/闭环 Closing/)).toBeVisible();

    await page.keyboard.press('ArrowRight'); // clamped
    await expect(page.getByText(`${TOTAL}/${TOTAL}`)).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText(`${TOTAL - 1}/${TOTAL}`)).toBeVisible();
  });

  test('scripture renders the embedded bilingual passage across five slides', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    // Part 1/5 = v.25 under the key phrase, real verse text, CUV + BSB — no IndexedDB cache involved
    await expect(page.getByText(/经文 Scripture.*· 1\/5/)).toBeVisible();
    await expect(page.getByText(/不要为生命忧虑吃甚么/)).toBeVisible();
    // Column headers: 和合本 first, then the pack's English version label (BSB)
    await expect(page.getByText('和合本 CUV', { exact: true })).toBeVisible();
    await expect(page.getByText('BSB', { exact: true })).toBeVisible();
    await expect(page.getByText(/do not worry about your life/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture.*· 3\/5/)).toBeVisible();
    await expect(page.getByText(/所罗门极荣华/)).toBeVisible();
    await expect(page.getByText(/Solomon in all his glory/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture.*· 5\/5/)).toBeVisible();
    await expect(page.getByText(/你们要先求他的国和他的义/)).toBeVisible();
    await expect(page.getByText(/seek first the kingdom of God/)).toBeVisible();
  });

  test('each discussion question is its own slide', async ({ page }) => {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await expect(page.getByText(/讨论 Discussion · 1\/5/)).toBeVisible();
    await expect(page.getByText(/Where does anxiety actually show up/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/讨论 Discussion · 2\/5/)).toBeVisible();
  });

  test('clicking does NOT navigate — arrow keys only (clicks are for selection)', async ({ page }) => {
    await openTV(page);
    const box = (await page.getByTestId('tv-presentation').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
    await expect(page.getByText(`1/${TOTAL}`)).toBeVisible(); // unchanged
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(`2/${TOTAL}`)).toBeVisible(); // keyboard still works
  });

  test('Escape exits back to the normal app', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tv-presentation')).toHaveCount(0);
  });

  test('the QR slide of the demo sample pack shows the bilingual no-sign-up line, no QR', async ({ page }) => {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.qr);
    await expect(page.getByText('签到 Sign up')).toBeVisible();
    await expect(page.getByTestId('qr-demo')).toHaveText(SU_DEMO_LINE);
    await expect(page.getByTestId('signup-qr')).toHaveCount(0);
  });

  test('an unclaimed LOCAL pack (seeded in IndexedDB) shows "sign in to enable sign-up" on its QR slide, not the demo line', async ({ page }) => {
    const sample = await fetchSamplePack(page);
    await seedLocalPack(page, { ...sample, id: 'local-2026-10-02-matt6' });
    await page.goto(packHash('local-2026-10-02-matt6'));
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText(`1/${TOTAL}`)).toBeVisible();
    await goToSlide(page, DEMO_SLIDE.qr);
    await expect(page.getByText('签到 Sign up')).toBeVisible();
    await expect(page.getByTestId('qr-unclaimed')).toContainText(SU_UNCLAIMED_LINE);
    await expect(page.getByTestId('qr-demo')).toHaveCount(0);
    await expect(page.getByTestId('signup-qr')).toHaveCount(0);
    const line = page.getByTestId('qr-unclaimed').getByText(SU_UNCLAIMED_LINE);
    expect(await line.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
  });

  test('an owned pack\'s QR slide draws its sign-up QR, prints its URL, and the instruction', async ({ page }) => {
    await routeOwnedSamplePack(page);
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.qr);
    await expect(page.getByText('签到 Sign up')).toBeVisible();
    const expectedUrl = expectedSignupUrl(page);
    const qr = page.getByTestId('signup-qr');
    await expect(qr).toHaveAttribute('data-signup-url', expectedUrl);
    await expect(qr.locator('svg')).toBeVisible();
    // Decoded check: the drawn modules equal the library's own encoding of that URL.
    expect(qrModulesPath(await qr.innerHTML())).toBe(qrModulesPath(await QRCode.toString(expectedUrl, QR_SVG_OPTIONS)));
    await expect(page.getByText(expectedUrl)).toBeVisible();
    await expect(page.getByText(SU_QR_BODY)).toBeVisible();
    await expect(page.getByTestId('qr-demo')).toHaveCount(0);
  });

  test('the life menu shows all 7 areas over two slides (3 + 4), in order', async ({ page }) => {
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.lifeMenu);
    await expect(page.getByText(/生活应用 Life Menu · 1\/2/)).toBeVisible();
    for (const area of LIFE_AREAS.slice(0, 3)) await expect(page.getByText(area)).toBeVisible();
    await expect(page.getByText(LIFE_AREAS[3])).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/生活应用 Life Menu · 2\/2/)).toBeVisible();
    for (const area of LIFE_AREAS.slice(3)) await expect(page.getByText(area)).toBeVisible();
  });
});

test.describe('Ask AI overlay', () => {
  test('"a" opens the overlay; typing a question does not flip slides', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(`2/${TOTAL}`)).toBeVisible();

    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();

    // Space / arrows / "a" inside the overlay must not navigate or re-trigger
    await page.keyboard.type('what about a bird');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    await expect(page.getByText(`2/${TOTAL}`)).toBeVisible();
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(1);
  });

  test('Escape closes the overlay first and TV mode second', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(0);
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText(`1/${TOTAL}`)).toBeVisible(); // slide position kept

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tv-presentation')).toHaveCount(0);
  });

  test('the persistent Ask AI button opens the overlay without flipping the slide', async ({ page }) => {
    await openTV(page);
    await page.getByRole('button', { name: ASK_AI_LABEL }).click();
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();
    await expect(page.getByText(`1/${TOTAL}`)).toBeVisible();
    await page.getByLabel(/Close Ask AI/).click();
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(0);
  });

  test('discussion slide: Ask AI auto-sends the question, one click', async ({ page }) => {
    // Key injected + OpenRouter mocked at the network level (helpers/tv.ts).
    await injectApiKey(page);
    // Only a key injected (no provider/model chosen): the request must carry the free router.
    await mockOpenRouterStream(page, ['Anxiety follows ', 'the treasure (v.25).'], wireModelId(DEFAULT_AI_SETUP.model));
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await expect(page.getByText(/讨论 Discussion · 1\/5/)).toBeVisible();

    await page.keyboard.press('a');
    // The slide's question appears as the already-submitted prompt…
    await expect(page.getByTestId('ask-question')).toContainText(/这一周，忧虑实际出现在哪里/);
    // …and the (mocked) answer renders, with the input free for follow-ups.
    await expect(page.getByText('Anxiety follows the treasure (v.25).')).toBeVisible();
    await expect(page.getByLabel(/Ask AI question/)).toBeEnabled();
    await expect(page.getByLabel(/Ask AI question/)).toHaveValue('');
  });

  test('answers render markdown with verse-ref tooltips from the pack', async ({ page }) => {
    await injectApiKey(page);
    // Mocked streamed answer: markdown bold + one in-pack ref (v.26)
    // and one out-of-pack ref (v.24 — resolved from the bundled data).
    await mockOpenRouterStream(page, ['**Trust** the Father ', '(v.26), unlike v.24.']);
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await page.keyboard.press('a');

    // Markdown: **Trust** renders as <strong>
    await expect(page.locator('[data-testid="ask-answer"] strong', { hasText: 'Trust' })).toBeVisible();
    // In-pack ref is interactive: hover shows the bilingual verse text (中文 first)
    const inPackRef = page.getByTestId('verse-ref').filter({ hasText: 'v.26' });
    await inPackRef.hover();
    await expect(page.getByRole('tooltip')).toContainText('飞鸟');
    await expect(page.getByRole('tooltip')).toContainText('birds of the air'); // BSB
    await page.keyboard.press('Escape'); // closes the popup, not the overlay
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    // Out-of-pack ref (v.24) is ALSO interactive, resolved from the bundled data
    const outRef = page.getByTestId('verse-ref').filter({ hasText: 'v.24' });
    await outRef.hover();
    await expect(page.getByRole('tooltip')).toContainText('一个人不能事奉两个主');   // 和合本 first
    await expect(page.getByRole('tooltip')).toContainText('No one can serve two masters'); // then BSB
  });

  test('without a key, signed out: the overlay shows the sign-in prompt — no key hints, nothing sent', async ({ page }) => {
    // Fresh browser context: no OpenRouter key and no session (ADR-0007). The signed-in
    // hosted path lives in hosted-ai.spec.ts; the own-key path is on the AI service page.
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await page.keyboard.press('a');
    const setup = page.getByTestId('quick-ai-setup');
    await expect(setup).toBeVisible();
    await expect(setup.getByRole('heading', { name: SETUP_TITLE })).toBeVisible();
    await expect(setup.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();
    await expect(setup.getByRole('button', { name: SETUP_OWN_KEY_TOGGLE })).toHaveCount(0);
    await expect(page.getByTestId('ask-ai-overlay')).not.toContainText(/OpenRouter|密钥/);
    await expect(page.getByLabel(/Ask AI question/)).toBeDisabled();
    await expect(page.getByTestId('ask-question')).toHaveCount(0); // nothing sent
  });
});
