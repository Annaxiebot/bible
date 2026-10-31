/**
 * hosted-ai.spec.ts — AI needs sign-in, and nothing else (ADR-0007) · 本站AI端到端
 *
 * A signed-in leader (dev-only session seam: window.__LEADER_E2E__ + the fake
 * Supabase base of helpers/signup) asks a question on the TV: the request
 * goes to the routed ai-proxy function with the user's bearer, the anon
 * apikey and role "ask", never to openrouter.ai, and the streamed answer
 * renders; the body is data only — no system message, the pack's mode as
 * content_language (the proxy owns the rules, ADR-0014). The AI service page
 * is a status page: ready line + this month's usage, nothing to configure.
 * A hosted no-credit reply shows the admin line with no own-key link (that
 * path was removed 2026-10-23). The site's daily pack cap shows its own
 * Chinese-first line on New study. A signed-out visitor sees the sign-in prompt.
 */
import { test, expect } from '@playwright/test';
import { SETUP_HASH } from '../../components/landing/landingRoute';
import { SETUP_TITLE, SETUP_HOSTED_READY, SETUP_SIGN_IN_TO_USE_AI } from '../../components/setup/setupStrings';
import { AI_CREDIT_USED_UP, AI_DAILY_CAP_REACHED } from '../../components/studypack/tvHints';
import { NS_GENERATE } from '../../components/newstudy/newStudyStrings';
import { E2E_ACCESS_TOKEN } from '../../services/aiProxyRoute';
import { E2E_SUPABASE_PATH, E2E_ANON_KEY } from './helpers/signup';
import { openTV, goToSlide, DEMO_SLIDE, sseBody } from './helpers/tv';
import { signInAsLeader, mockProxy, failOnOpenRouter } from './helpers/hostedAI';
import { openNewStudy, fillJohn3 } from './helpers/newStudy';
import { ASK_AI_ANSWER_CONTRACT } from '../../supabase/functions/_shared/aiPrompts';
import { LEGACY_CONTENT_LANGUAGE } from '../../components/studypack/principles';

const MODEL = 'google/gemini-2.5-flash';

test.describe('Hosted AI — signed in', () => {
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
    await expect(page.getByTestId('ask-question')).toContainText(/耶稣叫我们不要为哪些事忧虑/);
    await expect(page.getByTestId('ask-answer')).toContainText('忧虑跟着财宝走 (v.25).');
    await expect(page.getByLabel(/Ask AI question/)).toBeEnabled();

    const [call] = calls();
    expect(call.headers.authorization).toBe(`Bearer ${E2E_ACCESS_TOKEN}`);
    expect(call.headers.apikey).toBe(E2E_ANON_KEY);
    expect(call.body).toMatchObject({ role: 'ask', model: MODEL, stream: true, content_language: LEGACY_CONTENT_LANGUAGE });
    expect(call.body.messages.filter(m => m.role === 'system')).toHaveLength(0);
    expect(JSON.stringify(call.body.messages)).not.toContain(ASK_AI_ANSWER_CONTRACT.split('\n')[0]);
    expect(openRouterHits()).toBe(0);
  });

  test('a hosted no-credit reply shows the admin line — no own-key link, no key hint', async ({ page }) => {
    await signInAsLeader(page);
    await mockProxy(page, { status: 402, json: { error: 'no-credit' } });
    await openTV(page);
    await goToSlide(page, DEMO_SLIDE.discussion);
    await page.keyboard.press('a');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(AI_CREDIT_USED_UP);
    await expect(alert.getByRole('link')).toHaveCount(0);
    await expect(alert).not.toContainText(/OpenRouter|密钥|own key/);
  });

  test('New study: the site\'s daily pack cap (429 daily-cap) shows its Chinese-first line, never a half-pack', async ({ page }) => {
    await signInAsLeader(page);
    const calls = await mockProxy(page, { status: 429, json: { error: 'daily-cap', role: 'pack', limit: 30 } });
    await openNewStudy(page);
    await fillJohn3(page);
    await page.getByRole('button', { name: NS_GENERATE }).click();
    await expect(page.getByRole('alert')).toHaveText(AI_DAILY_CAP_REACHED);
    expect(AI_DAILY_CAP_REACHED.startsWith('今天的生成次数已满')).toBe(true);
    await expect(page.getByTestId('new-study-editor')).toHaveCount(0);
    expect(calls().map(c => c.body.role)).toEqual(['pack']);
  });

  test('the AI service page is a status page: ready line + this month\'s usage, nothing to configure', async ({ page }) => {
    await signInAsLeader(page);
    await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/ai_usage**`, route => route.fulfill({
      status: 200, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ role: 'ask', count: 12, monthly_limit: 300 }, { role: 'pack', count: 1, monthly_limit: 10 }]),
    }));
    await page.goto(`./${SETUP_HASH}`);
    const dialog = page.getByRole('dialog', { name: SETUP_TITLE });
    await expect(dialog.getByText(SETUP_HOSTED_READY)).toBeVisible();
    await expect(dialog.getByTestId('ai-usage')).toHaveText('本月 This month: 提问 12/300 · 查经包 1/10 · 个人研经 Personal Study 0/100');
    await expect(dialog.locator('input')).toHaveCount(0);
    await expect(dialog).not.toContainText(/OpenRouter|密钥|模型 Models/);
  });
});

test.describe('Hosted AI — signed out', () => {
  test('the AI service page leads with the sign-in prompt and offers no key at all', async ({ page }) => {
    await page.goto(`./${SETUP_HASH}`);
    const dialog = page.getByRole('dialog', { name: SETUP_TITLE });
    await expect(dialog.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    await expect(dialog).not.toContainText(/OpenRouter|密钥/);
  });
});
