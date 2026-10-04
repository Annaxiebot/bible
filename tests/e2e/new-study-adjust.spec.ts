/**
 * new-study-adjust.spec.ts — "AI 修改 Adjust with AI" on one pack section · 单段AI修改端到端
 *
 * A signed-in leader (dev-only seam: window.__LEADER_E2E__ + the fake
 * Supabase base) with no own key generates John 3:22–36 through the routed
 * ai-proxy (role 'pack'), then adjusts the discussion section with the
 * "更简单 · Simpler" chip: the request goes to ai-proxy with role 'adjust'
 * carrying the instruction and the current questions; while it runs the
 * section is dimmed with "AI 修改中…"; the new questions replace the old;
 * 撤销 Undo restores them; adjusting again and opening Preview shows the
 * adjusted question in TV mode (the edit went through auto-save). The
 * scripture and QR sections never offer the box. No call reaches openrouter.ai.
 */
import { test, expect, Page } from '@playwright/test';
import { NS_GENERATE, NS_EDIT_TITLE } from '../../components/newstudy/newStudyStrings';
import { AJ_OPEN, AJ_CHIPS, AJ_BUSY, AJ_UNDO } from '../../components/newstudy/adjustStrings';
import { JOHN3_REPLY_JSON, JOHN3_GENERATED } from '../../components/newstudy/__tests__/fixtures';
import { AI_PROXY_FUNCTION } from '../../services/aiProxyRoute';
import { E2E_SUPABASE_PATH, injectSupabaseOverride } from './helpers/signup';
import { fakeLeaderSession } from './helpers/leader';
import { sseBody, OPENROUTER_CHAT_URL } from './helpers/tv';
import { openNewStudy, fillJohn3, chunked } from './helpers/newStudy';

const MODEL = 'anthropic/claude-sonnet-4.5';
const SIMPLER = ['约翰的门徒为什么着急？ · Why were John\'s disciples upset (v.26)?', '谁让我们得到一切？ · Who gives us everything (v.27)?', '这周你可以怎样让耶稣在前？ · How can Jesus come first this week (v.30)?'];
const original = (i: number) => `${JOHN3_GENERATED.discussion[i].zh} · ${JOHN3_GENERATED.discussion[i].en}`;

interface ProxyBody { role: string; messages: Array<{ role: string; content: string }> }

/** Route ai-proxy: role 'pack' streams the John 3 pack; role 'adjust' waits for `release` and streams SIMPLER. */
async function mockProxy(page: Page) {
  const calls: ProxyBody[] = [];
  let release: () => void = () => undefined;
  let gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${E2E_SUPABASE_PATH}/functions/v1/${AI_PROXY_FUNCTION}`, async route => {
    const body = route.request().postDataJSON() as ProxyBody;
    calls.push(body);
    const text = body.role === 'pack' ? chunked(JOHN3_REPLY_JSON) : [JSON.stringify({ questions: SIMPLER })];
    if (body.role === 'adjust') await gate;
    const chunks = text.map((c, i) => ({ model: MODEL, choices: [{ delta: { content: c }, finish_reason: i === text.length - 1 ? 'stop' : null }] }));
    return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream' }, body: sseBody(chunks) });
  });
  return {
    calls: () => calls,
    release: () => release(),
    rearm: () => { gate = new Promise<void>(resolve => { release = resolve; }); },
  };
}

test('adjust a discussion section with 更简单 → busy → replaced → Undo restores → re-applied shows in Preview', async ({ page }) => {
  await injectSupabaseOverride(page);
  await fakeLeaderSession(page);
  let openRouterHits = 0;
  await page.route(OPENROUTER_CHAT_URL, route => { openRouterHits++; return route.abort(); });
  const proxy = await mockProxy(page);

  await openNewStudy(page);
  await fillJohn3(page);
  await page.getByRole('button', { name: NS_GENERATE }).click();
  await expect(page.getByText(NS_EDIT_TITLE)).toBeVisible();

  for (const kind of ['scripture', 'qr', 'title']) {
    await expect(page.locator(`[data-testid="ns-section"][data-kind="${kind}"]`).getByTestId('ns-adjust-open')).toHaveCount(0);
  }
  const section = page.locator('[data-testid="ns-section"][data-kind="discussion"]');
  const questions = section.getByTestId('ns-questions').getByRole('textbox');
  await expect(questions.first()).toHaveValue(original(0));

  const open = section.getByRole('button', { name: new RegExp(`^${AJ_OPEN}`) });
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await open.click();
  await section.getByRole('button', { name: AJ_CHIPS[0] }).click();
  const field = section.getByTestId('ns-adjust-input');
  await expect(field).toHaveValue(AJ_CHIPS[0]);
  expect(await field.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
  await section.getByTestId('ns-adjust-send').click();

  await expect(section.getByText(AJ_BUSY)).toBeVisible();
  await expect(section.locator('[aria-busy="true"]')).toHaveCount(1);
  proxy.release();
  await expect(questions).toHaveCount(SIMPLER.length);
  for (let i = 0; i < SIMPLER.length; i++) await expect(questions.nth(i)).toHaveValue(SIMPLER[i]);

  const adjustCall = proxy.calls().find(c => c.role === 'adjust')!;
  const userTurn = adjustCall.messages[adjustCall.messages.length - 1].content;
  expect(userTurn).toContain(AJ_CHIPS[0]);
  expect(userTurn).toContain(JOHN3_GENERATED.discussion[0].zh);

  await section.getByRole('button', { name: new RegExp(`^${AJ_UNDO}`) }).click();
  await expect(questions).toHaveCount(JOHN3_GENERATED.discussion.length);
  await expect(questions.first()).toHaveValue(original(0));

  // Adjust again, then Preview: the TV reads the auto-saved pack from IndexedDB.
  proxy.rearm();
  await open.click();
  await section.getByRole('button', { name: AJ_CHIPS[0] }).click();
  await section.getByTestId('ns-adjust-send').click();
  proxy.release();
  await expect(questions.first()).toHaveValue(SIMPLER[0]);
  await page.getByTestId('ns-preview').click();
  await expect(page.getByTestId('tv-presentation')).toBeVisible();
  const adjusted = page.getByText(/约翰的门徒为什么着急/);
  for (let i = 0; i < 25 && !(await adjusted.isVisible()); i++) await page.keyboard.press('ArrowRight');
  await expect(adjusted).toBeVisible();
  await expect(page.getByText(/约翰的门徒在意什么/)).toHaveCount(0);
  expect(openRouterHits).toBe(0);
});
