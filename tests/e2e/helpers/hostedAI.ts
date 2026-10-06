/**
 * hostedAI.ts — e2e helpers for hosted AI (ADR-0007) · 本站AI测试辅助
 *
 * `signInAsLeader`: the dev-only Google-session stand-in (window.__LEADER_E2E__,
 * the seam the leader pages and services/aiTransport read) + the fake
 * Supabase base of helpers/signup. `mockProxy` routes the ai-proxy function
 * under that base and records every call; `failOnOpenRouter` counts (and
 * aborts) any direct OpenRouter request, which a signed-in user without a
 * key must never make.
 */
import { Page } from '@playwright/test';
import { AI_PROXY_FUNCTION } from '../../../services/aiProxyRoute';
import { injectSupabaseOverride, E2E_SUPABASE_PATH, E2E_LEADER_ID } from './signup';
import { OPENROUTER_CHAT_URL, sseBody } from './tv';

export async function signInAsLeader(page: Page) {
  await injectSupabaseOverride(page);
  await page.addInitScript(uid => {
    (window as Window & { __LEADER_E2E__?: unknown }).__LEADER_E2E__ = { uid, email: 'leader@example.org', name: 'Leader' };
  }, E2E_LEADER_ID);
}

export interface ProxyCall {
  headers: Record<string, string>;
  body: { role: string; model: string; stream: boolean; messages: Array<{ role: string; content: string }> };
}

export async function mockProxy(page: Page, reply: { sse: string } | { status: number; json: object }): Promise<() => ProxyCall[]> {
  const calls: ProxyCall[] = [];
  await page.route(`**${E2E_SUPABASE_PATH}/functions/v1/${AI_PROXY_FUNCTION}`, route => {
    calls.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    if ('sse' in reply) return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: reply.sse });
    return route.fulfill({ status: reply.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reply.json) });
  });
  return () => calls;
}

export async function failOnOpenRouter(page: Page): Promise<() => number> {
  let hits = 0;
  await page.route(OPENROUTER_CHAT_URL, route => { hits++; return route.abort(); });
  return () => hits;
}

/** The answer the mocked proxy streams into the personal app's chat. */
export const CHAT_ANSWER = '恩典是白白得来的礼物 Grace is a free gift';

/**
 * Open #app's AI Chat as a signed-in user whose ai-proxy streams CHAT_ANSWER
 * (the personal app's one AI path, role 'study'). Returns the proxy calls.
 */
export async function openSignedInChat(page: Page, appHash: string): Promise<() => ProxyCall[]> {
  await signInAsLeader(page);
  const half = CHAT_ANSWER.length >> 1;
  const delta = (content: string) => ({ model: 'google/gemini-2.5-flash', choices: [{ delta: { content } }] });
  const calls = await mockProxy(page, { sse: sseBody([delta(CHAT_ANSWER.slice(0, half)), delta(CHAT_ANSWER.slice(half))]) });
  await page.goto(`/${appHash}`);
  await page.waitForLoadState('networkidle');
  await page.click('text=AI Chat');
  return calls;
}
