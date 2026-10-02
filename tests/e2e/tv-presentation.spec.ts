import { test, expect, Page } from '@playwright/test';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { SAMPLE_PACK_HASH } from '../../components/landing/landingRoute';
import { FIRST_SLIDE_HINT, ASK_AI_LABEL } from '../../components/studypack/tvHints';
import { LIFE_AREAS } from '../../components/studypack/principles';

async function openTV(page: Page) {
  await page.goto(SAMPLE_PACK_HASH);
  await expect(page.getByTestId('tv-presentation')).toBeVisible();
  await expect(page.getByText('不要忧虑 Do Not Be Anxious')).toBeVisible();
}

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
    await page.addInitScript(
      (key) => localStorage.setItem(key, 'e2e-test-key'),
      STORAGE_KEYS.OPENROUTER_API_KEY,
    );
    await page.route('https://openrouter.ai/api/v1/chat/completions', route =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
        body: [
          // Mocked streamed answer: markdown bold + one in-pack ref (v.26)
          // and one out-of-pack ref (v.24 — resolved from the bundled data).
          'data: {"choices":[{"delta":{"content":"**Trust** the Father "}}]}',
          '',
          'data: {"choices":[{"delta":{"content":"(v.26), unlike v.24."}}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n'),
      }));
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

  test('without an API key the overlay says OpenRouter is not configured', async ({ page }) => {
    // Fresh browser context has no OpenRouter key: the real unconfigured path.
    // The AI call itself is NOT exercised in e2e — no key, no network call.
    await openTV(page);
    await page.keyboard.press('a');
    await expect(page.getByText(/OpenRouter API key/)).toBeVisible();
    await expect(page.getByLabel(/Ask AI question/)).toBeDisabled();
  });
});

test.describe('Interactive cross-references (bundled Bible data)', () => {
  // Slide order: 1 title, 2–4 scripture, 5 context, 6 original language, 7 cross-refs
  async function openCrossRefsSlide(page: Page) {
    await openTV(page);
    for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/交叉经文 Cross-references/)).toBeVisible();
  }

  test('hovering "Philippians 4:6–7" shows 和合本 text first, then BSB', async ({ page }) => {
    await openCrossRefsSlide(page);
    const ref = page.getByTestId('verse-ref').filter({ hasText: 'Philippians 4:6–7' });
    await expect(ref).toBeVisible();
    await ref.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('应当一无挂虑');                 // 和合本 (简体) v.6
    await expect(tooltip).toContainText('Be anxious for nothing');      // BSB v.6
    await expect(tooltip).toContainText('present your requests to God');
    // Chinese renders before English within the verse block
    const text = await tooltip.innerText();
    expect(text.indexOf('应当一无挂虑')).toBeLessThan(text.indexOf('Be anxious for nothing'));
  });

  test('the Chinese form 路加福音 12:22–31 opens a long-range popup that stays in the viewport and scrolls', async ({ page }) => {
    await openCrossRefsSlide(page);
    const ref = page.getByTestId('verse-ref').filter({ hasText: '路加福音 12:22–31' });
    await ref.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('不要为生命忧虑');  // Luke 12:22 和合本
    const box = (await tooltip.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    // 10 bilingual verses cannot fit in half the viewport: content must scroll
    const scrollable = await tooltip.evaluate(el => el.scrollHeight > el.clientHeight);
    expect(scrollable).toBe(true);
  });

  test('a popup fetch failure shows the bilingual error line (no silent catch)', async ({ page }) => {
    await page.route('**/bible-data/**', route => route.fulfill({ status: 404, body: 'nope' }));
    await openCrossRefsSlide(page);
    await page.getByTestId('verse-ref').filter({ hasText: '1 Peter 5:7' }).hover();
    await expect(page.getByRole('tooltip')).toContainText('无法加载 could not load');
  });
});

test.describe('TV fit at 1080p', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('the densest scripture slide (3 bilingual verses) fits without scrolling', async ({ page }) => {
    await openTV(page);
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText(/经文 Scripture.*· 4\/4/)).toBeVisible(); // vv.32–34
    const fits = await page
      .getByTestId('tv-presentation')
      .evaluate(root => {
        const area = root.querySelector('.overflow-y-auto.flex-1') as HTMLElement;
        return area !== null && area.scrollHeight <= area.clientHeight + 1;
      });
    expect(fits).toBe(true);
  });
});

/** Dispatch a touch gesture through the real event system (React listens at the root). */
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.evaluate(([a, b]) => {
    const el = document.querySelector('[data-testid="tv-presentation"]')!;
    const touch = (x: number, y: number) =>
      new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    el.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, touches: [touch(a.x, a.y)], changedTouches: [touch(a.x, a.y)],
    }));
    el.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, touches: [], changedTouches: [touch(b.x, b.y)],
    }));
  }, [from, to] as const);
}

for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
  test.describe(`Phone viewport ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true });

    test('scripture and life-menu slides have no horizontal clipping and scroll vertically', async ({ page }) => {
      await openTV(page);
      await page.keyboard.press('ArrowRight'); // scripture 1/4
      const root = page.getByTestId('tv-presentation');
      const noHClip = () => root.evaluate(el => el.scrollWidth <= el.clientWidth + 1);
      expect(await noHClip()).toBe(true);

      for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight'); // life menu (slide 14/17)
      await expect(page.getByText(/生活应用 Life Menu/)).toBeVisible();
      expect(await noHClip()).toBe(true);
      // The dense 7-row menu exceeds a phone screen: the slide area must scroll
      const scrolls = await root.evaluate(el => {
        const content = el.querySelector('.select-text') as HTMLElement;
        return content.scrollHeight > content.clientHeight;
      });
      expect(scrolls).toBe(true);
    });

    test('a horizontal swipe still advances while vertical gestures scroll', async ({ page }) => {
      await openTV(page);
      const w = viewport.width;
      await swipe(page, { x: w * 0.8, y: 200 }, { x: w * 0.2, y: 210 }); // horizontal → next
      await expect(page.getByText('2/17')).toBeVisible();
      await swipe(page, { x: w * 0.5, y: 300 }, { x: w * 0.5 - 20, y: 80 }); // vertical-dominant → no flip
      await expect(page.getByText('2/17')).toBeVisible();
      await swipe(page, { x: w * 0.2, y: 200 }, { x: w * 0.8, y: 190 }); // horizontal back
      await expect(page.getByText('1/17')).toBeVisible();
    });
  });
}
