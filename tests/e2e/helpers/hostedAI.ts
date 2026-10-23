/**
 * hostedAI.ts — e2e helpers for AI, which needs sign-in (ADR-0007) · 本站AI测试辅助
 *
 * `signInAsLeader`: the dev-only session stand-in (window.__LEADER_E2E__,
 * the seam the leader pages and services/aiTransport read) + the fake
 * Supabase base of helpers/signup. Every AI call goes to the ai-proxy
 * function under that base, which passes OpenRouter's reply through
 * unchanged — so the mocks here script OpenRouter-shaped replies on the
 * proxy route: `mockProxy` (one reply, records calls), `mockAIStream`,
 * `mockAISequence` (one reply per request, records bodies), `mockAIHang`.
 * `failOnOpenRouter` counts (and aborts) any direct OpenRouter request,
 * which no page may make any more.
 */
import { Page, expect } from '@playwright/test';
import { AI_PROXY_FUNCTION } from '../../../services/aiProxyRoute';
import { injectSupabaseOverride, E2E_SUPABASE_PATH, E2E_LEADER_ID } from './signup';
import { OPENROUTER_CHAT_URL, sseBody } from './tv';

export async function signInAsLeader(page: Page) {
  await injectSupabaseOverride(page);
  await page.addInitScript(uid => {
    (window as Window & { __LEADER_E2E__?: unknown }).__LEADER_E2E__ = { uid, email: 'leader@example.org', name: 'Leader' };
  }, E2E_LEADER_ID);
}

/** The ai-proxy route under the fake Supabase base. */
export const AI_PROXY_ROUTE = `**${E2E_SUPABASE_PATH}/functions/v1/${AI_PROXY_FUNCTION}`;

export interface ProxyCall {
  headers: Record<string, string>;
  body: { role: string; model: string; stream: boolean; content_language?: string; messages: Array<{ role: string; content: string }> };
}

export async function mockProxy(page: Page, reply: { sse: string } | { status: number; json: object }): Promise<() => ProxyCall[]> {
  const calls: ProxyCall[] = [];
  await page.route(AI_PROXY_ROUTE, route => {
    calls.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    if ('sse' in reply) return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: reply.sse });
    return route.fulfill({ status: reply.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reply.json) });
  });
  return () => calls;
}

/** What a spec can assert about a recorded request body (the data form the browser sends, ADR-0014). */
export interface RecordedBody {
  role: string;
  model: string;
  reasoning?: unknown;
  max_tokens: number;
  content_language?: string;
  pack_source?: string;
  messages?: Array<{ role: string; content: string }>;
}

/**
 * Script the proxy with one reply per request, in order (the last one
 * repeats). Each entry is an SSE body (status 200, streaming), a plain JSON
 * completion (status 200) or a non-OK status with OpenRouter's error JSON
 * (passed through by the proxy). Records every request body.
 */
export async function mockAISequence(
  page: Page,
  replies: Array<{ sse: string } | { json: object } | { status: number; message: string }>,
): Promise<{ bodies: () => RecordedBody[] }> {
  const bodies: RecordedBody[] = [];
  let i = 0;
  await page.route(AI_PROXY_ROUTE, route => {
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

/** The proxy never answers (the request hangs until the page aborts it). */
export async function mockAIHang(page: Page) {
  await page.route(AI_PROXY_ROUTE, () => { /* intentionally never fulfilled */ });
}

/**
 * Stream `chunks` from the proxy as OpenRouter SSE deltas + [DONE] — no
 * live AI call. Honest limitation: route.fulfill delivers the whole body at
 * once, so specs assert the final streamed render; token-by-token rendering
 * is covered by unit tests.
 */
export async function mockAIStream(page: Page, chunks: string[], expectModel?: string) {
  await page.route(AI_PROXY_ROUTE, route => {
    if (expectModel !== undefined) {
      expect((route.request().postDataJSON() as { model: string }).model).toBe(expectModel);
    }
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
      body: sseBody(chunks.map(c => ({ choices: [{ delta: { content: c } }] }))),
    });
  });
}

export async function failOnOpenRouter(page: Page): Promise<() => number> {
  let hits = 0;
  await page.route(OPENROUTER_CHAT_URL, route => { hits++; return route.abort(); });
  return () => hits;
}

/** The answer the mocked proxy streams into the personal app's chat. */
export const CHAT_ANSWER = '恩典是白白得来的礼物 Grace is a free gift';

/**
 * Open #app's AI Chat as a signed-in user whose ai-proxy streams `chunks`
 * (default: CHAT_ANSWER in two halves) — the personal app's one AI path,
 * role 'study'. Returns the proxy calls.
 */
export async function openSignedInChat(page: Page, appHash: string, chunks?: readonly string[]): Promise<() => ProxyCall[]> {
  await signInAsLeader(page);
  const half = CHAT_ANSWER.length >> 1;
  const parts = chunks ?? [CHAT_ANSWER.slice(0, half), CHAT_ANSWER.slice(half)];
  const delta = (content: string) => ({ model: 'google/gemini-2.5-flash', choices: [{ delta: { content } }] });
  const calls = await mockProxy(page, { sse: sseBody(parts.map(delta)) });
  await page.goto(`/${appHash}`);
  await page.click('text=AI Chat');
  await expect(page.locator('textarea')).toBeVisible();
  return calls;
}
