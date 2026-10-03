/**
 * hosted-ai.spec.ts — AI with no key of one's own (ADR-0007) · 本站AI端到端
 *
 * A signed-in leader (dev-only session seam: window.__LEADER_E2E__ + the fake
 * Supabase base of helpers/signup) with no OpenRouter key asks a question on
 * the TV: the request goes to the routed ai-proxy function with the user's
 * bearer, the anon apikey and role "ask", never to openrouter.ai, and the
 * streamed answer renders. The AI service page is a status page: ready line
 * + this month's usage, the own-key path hidden behind its toggle. A hosted
 * no-credit reply is the one error line that links to that page. A
 * signed-out visitor sees the sign-in prompt.
 */
import { test, expect, Page } from '@playwright/test';
import { SETUP_HASH } from '../../components/landing/landingRoute';
import {
  SETUP_TITLE, SETUP_HOSTED_READY, SETUP_SIGN_IN_TO_USE_AI, SETUP_OWN_KEY_TOGGLE, SETUP_KEY_LABEL, SETUP_MODELS_TITLE,
} from '../../components/setup/setupStrings';
import { AI_CREDIT_USED_UP, AI_OWN_KEY_ON_STATUS_PAGE } from '../../components/studypack/tvHints';
import { AI_PROXY_FUNCTION, E2E_ACCESS_TOKEN } from '../../services/aiProxyRoute';
import { injectSupabaseOverride, E2E_SUPABASE_PATH, E2E_ANON_KEY, E2E_LEADER_ID } from './helpers/signup';
import { openTV, goToSlide, DEMO_SLIDE, sseBody, OPENROUTER_CHAT_URL } from './helpers/tv';

const MODEL = 'google/gemini-2.5-flash';

/** The dev-only Google-session stand-in (same seam the leader pages read) + the fake Supabase base. */
async function signInAsLeader(page: Page) {
  await injectSupabaseOverride(page);
  await page.addInitScript(uid => {
    (window as Window & { __LEADER_E2E__?: unknown }).__LEADER_E2E__ = { uid, email: 'leader@example.org', name: 'Leader' };
  }, E2E_LEADER_ID);
}

interface ProxyCall { headers: Record<string, string>; body: { role: string; model: string; stream: boolean } }

/** Route the ai-proxy function under the fake base; every call is recorded. */
async function mockProxy(page: Page, reply: { sse: string } | { status: number; json: object }): Promise<() => ProxyCall[]> {
  const calls: ProxyCall[] = [];
  await page.route(`**${E2E_SUPABASE_PATH}/functions/v1/${AI_PROXY_FUNCTION}`, route => {
    calls.push({ headers: route.request().headers(), body: route.request().postDataJSON() });
    if ('sse' in reply) return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: reply.sse });
    return route.fulfill({ status: reply.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reply.json) });
  });
  return () => calls;
}

async function failOnOpenRouter(page: Page): Promise<() => number> {
  let hits = 0;
  await page.route(OPENROUTER_CHAT_URL, route => { hits++; return route.abort(); });
  return () => hits;
}

test.describe('Hosted AI — signed in, no own key', () => {
  test('TV Ask AI: no setup, the question goes to ai-proxy (bearer, apikey, role ask) and the streamed answer renders', async ({ page }) => {
    await signInAsLeader(page);
    const openRouterHits = await failOnOpenRouter(page);
    const calls = await mockProxy(page, {
      sse: sseBody([
        { model: MODEL, choices: [{ delta: { content: '忧虑跟着财宝走 ' } }] },
        { model: MODEL, choices: [{ delta: { content: '(v.25).' }, finish_reason: 'stop' }] },
      ]),
    });
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await page.keyboard.press('a');

    await expect(page.getByTestId('quick-ai-setup')).toHaveCount(0);
    await expect(page.getByText(/Q: 这一周，忧虑实际出现在哪里/)).toBeVisible();
    await expect(page.getByTestId('ask-answer')).toContainText('忧虑跟着财宝走 (v.25).');
    await expect(page.getByLabel(/Ask AI question/)).toBeEnabled();

    const [call] = calls();
    expect(call.headers.authorization).toBe(`Bearer ${E2E_ACCESS_TOKEN}`);
    expect(call.headers.apikey).toBe(E2E_ANON_KEY);
    expect(call.body).toMatchObject({ role: 'ask', model: MODEL, stream: true });
    expect(openRouterHits()).toBe(0);
  });

  test('a hosted no-credit reply shows the admin line and the one link to the AI service page', async ({ page }) => {
    await signInAsLeader(page);
    await mockProxy(page, { status: 402, json: { error: 'no-credit' } });
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await page.keyboard.press('a');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(AI_CREDIT_USED_UP);
    await expect(alert.getByRole('link', { name: AI_OWN_KEY_ON_STATUS_PAGE })).toHaveAttribute('href', SETUP_HASH);
  });

  test('the AI service page is a status page: ready line + this month\'s usage; the own key stays behind its toggle', async ({ page }) => {
    await signInAsLeader(page);
    await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/ai_usage**`, route => route.fulfill({
      status: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ role: 'ask', count: 12, monthly_limit: 300 }, { role: 'pack', count: 1, monthly_limit: 10 }]),
    }));
    await page.goto(`./${SETUP_HASH}`);
    const dialog = page.getByRole('dialog', { name: SETUP_TITLE });
    await expect(dialog.getByText(SETUP_HOSTED_READY)).toBeVisible();
    await expect(dialog.getByTestId('ai-usage')).toHaveText('本月 This month: 提问 12/300 · 查经包 1/10');
    await expect(dialog.getByLabel(SETUP_KEY_LABEL)).toHaveCount(0);
    await expect(dialog.getByText(SETUP_MODELS_TITLE)).toHaveCount(0);
    const toggle = dialog.getByRole('button', { name: SETUP_OWN_KEY_TOGGLE });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(dialog.getByLabel(SETUP_KEY_LABEL)).toBeVisible();
    await expect(dialog.getByTestId('model-rows')).toBeVisible();
  });
});

test.describe('Hosted AI — signed out, no own key', () => {
  test('the AI service page leads with the sign-in prompt; the own-key toggle is collapsed below it', async ({ page }) => {
    await page.goto(`./${SETUP_HASH}`);
    const dialog = page.getByRole('dialog', { name: SETUP_TITLE });
    await expect(dialog.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();
    await expect(dialog.getByRole('button', { name: SETUP_OWN_KEY_TOGGLE })).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByLabel(SETUP_KEY_LABEL)).toHaveCount(0);
  });
});
