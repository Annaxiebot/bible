/**
 * tv-presentation.spec.ts — TV presentation mode + Ask AI overlay · 大屏模式端到端
 *
 * Navigation, slide content and the Ask AI overlay (configured, mocked at
 * the network level; unconfigured → inline key setup → auto-send). Cross-
 * references live in tv-cross-refs.spec.ts; 1080p fit and phone viewports
 * in tv-phone.spec.ts. Shared helpers: helpers/tv.ts.
 */
import { test, expect } from '@playwright/test';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { FIRST_SLIDE_HINT, ASK_AI_LABEL } from '../../components/studypack/tvHints';
import { LIFE_AREAS } from '../../components/studypack/principles';
import { DEFAULT_AI_SETUP, wireModelId } from '../../services/aiDefaults';
import { SETUP_TITLE, SETUP_KEY_LABEL, SETUP_SAVE } from '../../components/setup/setupStrings';
import { openTV, injectApiKey, mockOpenRouterStream } from './helpers/tv';

test.describe('TV Presentation Mode', () => {
  test('loads the pack from the URL and shows the title slide', async ({ page }) => {
    await openTV(page);
    await expect(page.getByText('1/17')).toBeVisible();
    await expect(page.getByText(FIRST_SLIDE_HINT)).toBeVisible();
  });

  test('advances through all 17 slides with the keyboard and clamps at the end', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('2/17')).toBeVisible();
    await expect(page.getByText(/经文 Scripture/)).toBeVisible();

    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('17/17')).toBeVisible();
    await expect(page.getByText(/闭环 Closing/)).toBeVisible();

    await page.keyboard.press('ArrowRight'); // clamped
    await expect(page.getByText('17/17')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('16/17')).toBeVisible();
  });

  test('scripture renders the embedded bilingual passage across four slides', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    // Part 1/4 = vv.25-26, real verse text, CUV + BSB — no IndexedDB cache involved
    await expect(page.getByText(/经文 Scripture.*· 1\/4/)).toBeVisible();
    await expect(page.getByText(/不要为生命忧虑吃甚么/)).toBeVisible();
    // Column headers: 和合本 first, then the pack's English version label (BSB)
    await expect(page.getByText('和合本 CUV', { exact: true })).toBeVisible();
    await expect(page.getByText('BSB', { exact: true })).toBeVisible();
    await expect(page.getByText(/do not worry about your life/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture.*· 3\/4/)).toBeVisible();
    await expect(page.getByText(/所罗门极荣华/)).toBeVisible();
    await expect(page.getByText(/Solomon in all his glory/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture.*· 4\/4/)).toBeVisible();
    await expect(page.getByText(/你们要先求他的国和他的义/)).toBeVisible();
    await expect(page.getByText(/seek first the kingdom of God/)).toBeVisible();
  });

  test('each discussion question is its own slide', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
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
    await expect(page.getByText('1/17')).toBeVisible(); // unchanged
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('2/17')).toBeVisible(); // keyboard still works
  });

  test('Escape exits back to the normal app', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tv-presentation')).toHaveCount(0);
  });

  test('the QR sign-up slide shows the code image, URL, and instruction', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('签到 Sign up')).toBeVisible();
    const qr = page.getByAltText(/QR code for https:\/\/forms\.gle\/kXamVsHcRTXHbZ4d6/);
    await expect(qr).toBeVisible();
    // The PNG must actually load (not a broken image)
    await expect(qr).toHaveJSProperty('naturalWidth', 640);
    await expect(page.getByText('https://forms.gle/kXamVsHcRTXHbZ4d6')).toBeVisible();
    await expect(page.getByText(/Scan to get the Tue\/Thu check-in texts/)).toBeVisible();
  });

  test('the life menu slide shows all 7 areas', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 13; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/生活应用 Life Menu/)).toBeVisible();
    for (const area of LIFE_AREAS) {
      await expect(page.getByText(area)).toBeVisible();
    }
  });
});

test.describe('Ask AI overlay', () => {
  test('"a" opens the overlay; typing a question does not flip slides', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('2/17')).toBeVisible();

    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();

    // Space / arrows / "a" inside the overlay must not navigate or re-trigger
    await page.keyboard.type('what about a bird');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    await expect(page.getByText('2/17')).toBeVisible();
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(1);
  });

  test('Escape closes the overlay first and TV mode second', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(0);
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('1/17')).toBeVisible(); // slide position kept

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tv-presentation')).toHaveCount(0);
  });

  test('the persistent Ask AI button opens the overlay without flipping the slide', async ({ page }) => {
    await openTV(page);
    await page.getByRole('button', { name: ASK_AI_LABEL }).click();
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();
    await expect(page.getByText('1/17')).toBeVisible();
    await page.getByLabel(/Close Ask AI/).click();
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(0);
  });

  test('discussion slide: Ask AI auto-sends the question, one click', async ({ page }) => {
    // Key injected + OpenRouter mocked at the network level (helpers/tv.ts).
    await injectApiKey(page);
    // Only a key injected (no provider/model chosen): the request must carry the free router.
    await mockOpenRouterStream(page, ['Anxiety follows ', 'the treasure (v.25).'], wireModelId(DEFAULT_AI_SETUP.model));
    await openTV(page);
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/讨论 Discussion · 1\/5/)).toBeVisible();

    await page.keyboard.press('a');
    // The slide's question appears as the already-submitted prompt…
    await expect(page.getByText(/Q: 这一周，忧虑实际出现在哪里/)).toBeVisible();
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
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
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

  test('without a key: the overlay shows the inline setup; Save sends the pending question', async ({ page }) => {
    // Fresh browser context has no OpenRouter key: the real unconfigured path.
    // The key is typed into the masked field (never a URL); the chat call is mocked.
    await mockOpenRouterStream(page, ['Anxiety follows ', 'the treasure (v.25).'], wireModelId(DEFAULT_AI_SETUP.model));
    await openTV(page);
    for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('a');
    const setup = page.getByTestId('quick-ai-setup');
    await expect(setup).toBeVisible();
    await expect(setup.getByRole('heading', { name: SETUP_TITLE })).toBeVisible();
    await expect(page.getByLabel(/Ask AI question/)).toBeDisabled();
    await expect(page.getByText(/Q: 这一周/)).toHaveCount(0); // nothing sent yet

    const field = setup.getByLabel(SETUP_KEY_LABEL);
    await expect(field).toHaveAttribute('type', 'password');
    await field.fill('sk-or-e2e-key');
    await setup.getByRole('button', { name: SETUP_SAVE }).click();

    // Stored under the existing key + defaults applied; the key never reached the URL
    const stored = await page.evaluate(([k, p, m]) => [
      localStorage.getItem(k), localStorage.getItem(p), localStorage.getItem(m),
    ], [STORAGE_KEYS.OPENROUTER_API_KEY, STORAGE_KEYS.AI_PROVIDER, STORAGE_KEYS.AI_MODEL]);
    expect(stored).toEqual(['sk-or-e2e-key', DEFAULT_AI_SETUP.provider, DEFAULT_AI_SETUP.model]);
    expect(page.url()).not.toContain('sk-or-e2e-key');

    // The pending discussion question auto-sends and the mocked answer renders
    await expect(setup).toHaveCount(0);
    await expect(page.getByText(/Q: 这一周，忧虑实际出现在哪里/)).toBeVisible();
    await expect(page.getByText('Anxiety follows the treasure (v.25).')).toBeVisible();
    await expect(page.getByLabel(/Ask AI question/)).toBeEnabled();
  });
});
