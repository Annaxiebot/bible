/**
 * tv.ts — shared helpers for the TV presentation e2e specs · 大屏测试辅助
 *
 * One copy (R3) used by tv-presentation, tv-cross-refs and tv-phone specs.
 */
import { expect, Page } from '@playwright/test';
import { SAMPLE_PACK_HASH } from '../../../components/landing/landingRoute';

/** No page may call this any more (ADR-0007, 2026-10-23: AI goes through the proxy); specs route it only to count and abort. */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * A typed URL carries no click, so a real browser opens TV mode windowed.
 * Playwright's own page evaluations count as user gestures, which would let
 * TV mode's "use the opening click" request full screen on every direct
 * load; report "no gesture" the way a real browser would.
 */
export async function withoutCarriedGesture(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'userActivation', { get: () => ({ isActive: false, hasBeenActive: false }) });
  });
}

/** Open the sample pack in TV mode (optionally with a query after the hash) and wait for the title slide. */
export async function openTV(page: Page, hashQuery = '') {
  await withoutCarriedGesture(page);
  await page.goto(`${SAMPLE_PACK_HASH}${hashQuery}`);
  await expect(page.getByTestId('tv-presentation')).toBeVisible();
  await expect(page.getByText('不要忧虑 Do Not Be Anxious')).toBeVisible();
}

/**
 * Wait until the WenKai face of `weight` is registered and loaded for `sample`
 * (the page's stylesheet must be applied: an empty load means it is not yet),
 * then for every pending font. Fit checks must measure the real face, never
 * the fallback (R14: no vacuous pass while the CDN font is still loading).
 */
export async function waitForWenKai(page: Page, weight: 400 | 700, sample: string) {
  await expect.poll(() => page.evaluate(async ([w, text]) => {
    const faces = await document.fonts.load(`${w} 40px "LXGW WenKai"`, text);
    // Weight must match: asking for 400 with only the bold CSS applied returns the 700 face.
    return faces.filter(f => f.status === 'loaded' && f.weight === String(w)).length;
  }, [weight, sample] as const), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/**
 * 1-based slide numbers of the sample pack (2026-10-02-matt6), pinned in
 * packTypes.test.ts. One copy, so a change to how much text a slide carries
 * (slideFit.ts) is updated here once, not in every spec.
 */
export const DEMO_SLIDE = {
  total: 26,
  scripture: 2,        // 2–6: scripture 1/5–5/5
  context: 7,          // 7–8
  originalLanguage: 9, // 9–11
  crossRefs: 12,       // 12–13
  discussion: 14,      // 14–20: one per question (observation questions first)
  weekQuestion: 17,    // Q4 "Where does anxiety actually show up in your week?" — the shortest question
  lifeMenu: 21,        // 21–22
  reflection: 23,      // 23–24
  qr: 25,
  closing: 26,
} as const;

/** From the title slide, press ArrowRight until slide `n` (1-based) is shown. */
export async function goToSlide(page: Page, n: number) {
  for (let i = 1; i < n; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('tv-counter')).toHaveText(`${n}/${DEMO_SLIDE.total}`);
}

/** Shorten the Ask-AI first-token budget (dev-only override read by askAIFallback.firstTokenTimeoutMs). */
export async function setAskAITimeout(page: Page, ms: number) {
  await page.addInitScript((value) => { (window as Window & { __ASK_AI_TIMEOUT_MS?: number }).__ASK_AI_TIMEOUT_MS = value; }, ms);
}

/** One SSE body from OpenRouter-shaped chunk objects (each becomes a "data:" line) + [DONE]. */
export function sseBody(chunks: object[]): string {
  return [...chunks.flatMap(c => [`data: ${JSON.stringify(c)}`, '']), 'data: [DONE]', ''].join('\n');
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
