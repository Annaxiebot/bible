/**
 * tv.ts — shared helpers for the TV presentation e2e specs · 大屏测试辅助
 *
 * One copy (R3) used by tv-presentation, tv-cross-refs and tv-phone specs.
 */
import { expect, Page } from '@playwright/test';
import { SAMPLE_PACK_HASH } from '../../../components/landing/landingRoute';
import { STORAGE_KEYS } from '../../../constants/storageKeys';

export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Open the sample pack in TV mode and wait for the title slide. */
export async function openTV(page: Page) {
  await page.goto(SAMPLE_PACK_HASH);
  await expect(page.getByTestId('tv-presentation')).toBeVisible();
  await expect(page.getByText('不要忧虑 Do Not Be Anxious')).toBeVisible();
}

/** Inject an OpenRouter key before any script runs (the "configured" state). */
export async function injectApiKey(page: Page) {
  await page.addInitScript(
    (key) => localStorage.setItem(key, 'e2e-test-key'),
    STORAGE_KEYS.OPENROUTER_API_KEY,
  );
}

/**
 * Mock the OpenRouter chat endpoint at the network level with a real SSE
 * body (delta chunks + [DONE]) — no live AI call. Honest limitation:
 * route.fulfill delivers the whole body at once, so specs assert the final
 * streamed render; token-by-token rendering is covered by unit tests.
 */
export async function mockOpenRouterStream(page: Page, chunks: string[], expectModel?: string) {
  await page.route(OPENROUTER_CHAT_URL, route => {
    if (expectModel !== undefined) {
      expect((route.request().postDataJSON() as { model: string }).model).toBe(expectModel);
    }
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: [
        ...chunks.flatMap(c => [`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}`, '']),
        'data: [DONE]',
        '',
      ].join('\n'),
    });
  });
}

/** Dispatch a touch gesture through the real event system (React listens at the root). */
export async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
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
