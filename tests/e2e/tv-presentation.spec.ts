import { test, expect, Page } from '@playwright/test';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { SAMPLE_PACK_HASH } from '../../components/landing/landingRoute';

async function openTV(page: Page) {
  await page.goto(SAMPLE_PACK_HASH);
  await expect(page.getByTestId('tv-presentation')).toBeVisible();
  await expect(page.getByText('Do Not Be Anxious 不要忧虑')).toBeVisible();
}

test.describe('TV Presentation Mode', () => {
  test('loads the pack from the URL and shows the title slide', async ({ page }) => {
    await openTV(page);
    await expect(page.getByText('1/16')).toBeVisible();
    await expect(page.getByText(/Arrow keys, click, or swipe/)).toBeVisible();
  });

  test('advances through all 16 slides with the keyboard and clamps at the end', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('2/16')).toBeVisible();
    await expect(page.getByText(/Scripture 经文/)).toBeVisible();

    for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('16/16')).toBeVisible();
    await expect(page.getByText(/Closing 闭环/)).toBeVisible();

    await page.keyboard.press('ArrowRight'); // clamped
    await expect(page.getByText('16/16')).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('15/16')).toBeVisible();
  });

  test('scripture renders the embedded bilingual passage across three slides', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    // Part 1/3 = vv.25-27, real verse text, CUV + WEB — no IndexedDB cache involved
    await expect(page.getByText(/Scripture 经文.*· 1\/3/)).toBeVisible();
    await expect(page.getByText(/不要為生命憂慮/)).toBeVisible();
    await expect(page.getByText(/don’t be anxious for your life/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/Scripture 经文.*· 2\/3/)).toBeVisible();
    await expect(page.getByText(/所羅門極榮華/)).toBeVisible();
    await expect(page.getByText(/Solomon in all his glory/)).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/Scripture 经文.*· 3\/3/)).toBeVisible();
    await expect(page.getByText(/你們要先求他的國和他的義/)).toBeVisible();
    await expect(page.getByText(/seek first God’s Kingdom/)).toBeVisible();
  });

  test('each discussion question is its own slide', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/Discussion 讨论 · 1\/5/)).toBeVisible();
    await expect(page.getByText(/Where does anxiety actually show up/)).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/Discussion 讨论 · 2\/5/)).toBeVisible();
  });

  test('clicking the right and left halves of the screen navigates', async ({ page }) => {
    await openTV(page);
    const box = (await page.getByTestId('tv-presentation').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
    await expect(page.getByText('2/16')).toBeVisible();
    await page.mouse.click(box.x + box.width * 0.1, box.y + box.height / 2);
    await expect(page.getByText('1/16')).toBeVisible();
  });

  test('Escape exits back to the normal app', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tv-presentation')).toHaveCount(0);
  });

  test('the QR sign-up slide shows the code image, URL, and instruction', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('Sign up 签到')).toBeVisible();
    const qr = page.getByAltText(/QR code for https:\/\/forms\.gle\/kXamVsHcRTXHbZ4d6/);
    await expect(qr).toBeVisible();
    // The PNG must actually load (not a broken image)
    await expect(qr).toHaveJSProperty('naturalWidth', 640);
    await expect(page.getByText('https://forms.gle/kXamVsHcRTXHbZ4d6')).toBeVisible();
    await expect(page.getByText(/Scan to get the Tue\/Thu check-in texts/)).toBeVisible();
  });

  test('the life menu slide shows all 7 areas', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/Life Menu 生活应用/)).toBeVisible();
    for (const area of ['Health 健康', 'Relationships 关系', 'Family 家庭', 'Work 工作', 'Emotional 情绪', 'Finance 财务', 'Spiritual 属灵']) {
      await expect(page.getByText(area)).toBeVisible();
    }
  });
});

test.describe('Ask AI overlay', () => {
  test('"a" opens the overlay; typing a question does not flip slides', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('2/16')).toBeVisible();

    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();

    // Space / arrows / "a" inside the overlay must not navigate or re-trigger
    await page.keyboard.type('what about a bird');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(' ');
    await expect(page.getByText('2/16')).toBeVisible();
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(1);
  });

  test('Escape closes the overlay first and TV mode second', async ({ page }) => {
    await openTV(page);
    await page.keyboard.press('a');
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(0);
    await expect(page.getByTestId('tv-presentation')).toBeVisible();
    await expect(page.getByText('1/16')).toBeVisible(); // slide position kept

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('tv-presentation')).toHaveCount(0);
  });

  test('the persistent Ask AI button opens the overlay without flipping the slide', async ({ page }) => {
    await openTV(page);
    await page.getByRole('button', { name: 'Ask AI 问AI' }).click();
    await expect(page.getByTestId('ask-ai-overlay')).toBeVisible();
    await expect(page.getByText('1/16')).toBeVisible();
    await page.getByLabel(/Close Ask AI/).click();
    await expect(page.getByTestId('ask-ai-overlay')).toHaveCount(0);
  });

  test('discussion slide: Ask AI auto-sends the question, one click', async ({ page }) => {
    // Key injected + the OpenRouter endpoint mocked at the network level with
    // a real SSE stream body (delta chunks + [DONE]) — no live AI call.
    // Honest limitation: route.fulfill delivers the whole body at once, so
    // this asserts the final streamed render; token-by-token incremental
    // rendering is covered by the AskAIOverlay unit tests.
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'e2e-test-key'),
      STORAGE_KEYS.OPENROUTER_API_KEY,
    );
    await page.route('https://openrouter.ai/api/v1/chat/completions', route =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: [
          'data: {"choices":[{"delta":{"role":"assistant","content":"Anxiety follows "}}]}',
          '',
          'data: {"choices":[{"delta":{"content":"the treasure (v.25)."}}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
      }));
    await openTV(page);
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/Discussion 讨论 · 1\/5/)).toBeVisible();

    await page.keyboard.press('a');
    // The slide's question appears as the already-submitted prompt…
    await expect(page.getByText(/Q: Where does anxiety actually show up/)).toBeVisible();
    // …and the (mocked) answer renders, with the input free for follow-ups.
    await expect(page.getByText('Anxiety follows the treasure (v.25).')).toBeVisible();
    await expect(page.getByLabel(/Ask AI question/)).toBeEnabled();
    await expect(page.getByLabel(/Ask AI question/)).toHaveValue('');
  });

  test('without an API key the overlay says OpenRouter is not configured', async ({ page }) => {
    // Fresh browser context has no OpenRouter key: the real unconfigured path.
    // The AI call itself is NOT exercised in e2e — no key, no network call.
    await openTV(page);
    await page.keyboard.press('a');
    await expect(page.getByText(/OpenRouter API key/)).toBeVisible();
    await expect(page.getByLabel(/Ask AI question/)).toBeDisabled();
  });
});
