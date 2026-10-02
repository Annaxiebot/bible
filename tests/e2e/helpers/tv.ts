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

/** The key every spec injects; never a real one. Its last 4 characters are what the saved state shows. */
export const E2E_API_KEY = 'e2e-test-key';

/** Inject an OpenRouter key before any script runs (the "configured" state). */
export async function injectApiKey(page: Page, key = E2E_API_KEY) {
  await page.addInitScript(
    ([storageKey, value]) => localStorage.setItem(storageKey, value),
    [STORAGE_KEYS.OPENROUTER_API_KEY, key] as const,
  );
}

/** Shorten the Ask-AI first-token budget (dev-only override read by askAIFallback.firstTokenTimeoutMs). */
export async function setAskAITimeout(page: Page, ms: number) {
  await page.addInitScript((value) => { (window as Window & { __ASK_AI_TIMEOUT_MS?: number }).__ASK_AI_TIMEOUT_MS = value; }, ms);
}

/** One SSE body from OpenRouter-shaped chunk objects (each becomes a "data:" line) + [DONE]. */
export function sseBody(chunks: object[]): string {
  return [...chunks.flatMap(c => [`data: ${JSON.stringify(c)}`, '']), 'data: [DONE]', ''].join('\n');
}

/** What a spec can assert about a recorded request body. */
export interface RecordedBody {
  model: string;
  reasoning?: unknown;
  max_tokens: number;
  messages?: Array<{ role: string; content: string }>;
}

/**
 * Mock the chat endpoint with one scripted reply per request, in order (the
 * last one repeats). Each entry is an SSE body (status 200, streaming), a
 * plain JSON completion (status 200, the non-streaming Test call) or a
 * non-OK status with OpenRouter's error JSON. Records every request body.
 */
export async function mockOpenRouterSequence(
  page: Page,
  replies: Array<{ sse: string } | { json: object } | { status: number; message: string }>,
): Promise<{ bodies: () => RecordedBody[] }> {
  const bodies: RecordedBody[] = [];
  let i = 0;
  await page.route(OPENROUTER_CHAT_URL, route => {
    bodies.push(route.request().postDataJSON());
    const reply = replies[Math.min(i++, replies.length - 1)];
    if ('sse' in reply) {
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: reply.sse });
    }
    if ('json' in reply) {
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reply.json) });
    }
    return route.fulfill({
      status: reply.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: reply.message, code: reply.status } }),
    });
  });
  return { bodies: () => bodies };
}

/** The chat endpoint never answers (the request hangs until the page aborts it). */
export async function mockOpenRouterHang(page: Page) {
  await page.route(OPENROUTER_CHAT_URL, () => { /* intentionally never fulfilled */ });
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
