/**
 * tv-ask-ai-failures.spec.ts — Ask AI failures are impossible to miss · 问AI失败端到端
 *
 * OpenRouter mocked at the network level (helpers/tv.ts): a 401 shows the
 * invalid-key line with Set up AI; a hung request shows the timeout line
 * with the model id and Retry; a reasoning-only stream is retried with
 * reasoning off and the retry's content renders; an in-stream error event
 * is shown bilingually. With an own key the request still carries the
 * server's system message (scope guard + the pack's rules, ADR-0014) first,
 * on the retry too. Happy paths live in tv-presentation.spec.ts.
 */
import { test, expect, Page } from '@playwright/test';
import {
  AI_INVALID_KEY_MESSAGE, AI_TIMEOUT, AI_STREAM_ERROR, TV_RETRY, modelLine, thinkingLine,
} from '../../components/studypack/tvHints';
import { SETUP_OPEN_BUTTON } from '../../components/setup/setupStrings';
import { ASK_AI_MODEL } from '../../services/aiDefaults';
import { SCOPE_GUARD, askSystemText } from '../../supabase/functions/_shared/aiPrompts';
import { LEGACY_CONTENT_LANGUAGE } from '../../components/studypack/principles';
import { openTV, goToSlide, DEMO_SLIDE, injectApiKey, mockOpenRouterSequence, mockOpenRouterHang, setAskAITimeout, sseBody } from './helpers/tv';

const E2E_TIMEOUT_MS = 1500;

/** Go to the first discussion slide and open Ask AI (auto-sends the slide's question). */
async function askOnDiscussionSlide(page: Page) {
  await openTV(page);
  await goToSlide(page, DEMO_SLIDE.discussion);
  await expect(page.getByText(/讨论 Discussion · 1\/5/)).toBeVisible();
  await page.keyboard.press('a');
  await expect(page.getByText(/Q: 这一周，忧虑实际出现在哪里/)).toBeVisible();
}

test.describe('Ask AI failures on the TV', () => {
  test('401 → the bilingual invalid-key line with status, and a Set up AI button', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterSequence(page, [{ status: 401, message: 'User not found.' }]);
    await askOnDiscussionSlide(page);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(AI_INVALID_KEY_MESSAGE);
    await expect(alert).toContainText('HTTP 401: User not found.');
    await expect(alert.getByRole('button', { name: SETUP_OPEN_BUTTON })).toBeVisible();
    await expect(alert.getByRole('button', { name: TV_RETRY })).toHaveCount(0);
  });

  test('a hung request → thinking line names the model, then the timeout line with model id, Retry and Set up AI', async ({ page }) => {
    await injectApiKey(page);
    await setAskAITimeout(page, E2E_TIMEOUT_MS);
    await mockOpenRouterHang(page);
    await askOnDiscussionSlide(page);
    await expect(page.getByTestId('ask-thinking')).toHaveText(thinkingLine(ASK_AI_MODEL));
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(AI_TIMEOUT, { timeout: E2E_TIMEOUT_MS * 4 });
    await expect(alert).toContainText(modelLine(ASK_AI_MODEL));
    await expect(alert.getByRole('button', { name: TV_RETRY })).toBeVisible();
    await expect(alert.getByRole('button', { name: SETUP_OPEN_BUTTON })).toBeVisible();
    await expect(page.getByTestId('ask-thinking')).toHaveCount(0);
  });

  test('reasoning-only first reply → automatic retry with reasoning off → the retry answer renders with its model', async ({ page }) => {
    await injectApiKey(page);
    const mock = await mockOpenRouterSequence(page, [
      { sse: sseBody([
        { model: ASK_AI_MODEL, choices: [{ delta: { reasoning: 'Let me think about treasure…' } }] },
        { model: ASK_AI_MODEL, choices: [{ delta: {}, finish_reason: 'length' }] },
      ]) },
      { sse: sseBody([
        { model: 'google/gemini-2.5-flash', choices: [{ delta: { content: 'Anxiety follows ' } }] },
        { model: 'google/gemini-2.5-flash', choices: [{ delta: { content: 'the treasure (v.25).' }, finish_reason: 'stop' }] },
      ]) },
    ]);
    await askOnDiscussionSlide(page);
    await expect(page.getByText('Anxiety follows the treasure (v.25).')).toBeVisible();
    await expect(page.getByTestId('ask-model')).toHaveText(modelLine('google/gemini-2.5-flash'));
    await expect(page.getByRole('alert')).toHaveCount(0);
    const bodies = mock.bodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].reasoning).toBeUndefined();
    expect(bodies[1].reasoning).toEqual({ enabled: false, exclude: true });
    expect(bodies[1].max_tokens).toBeGreaterThan(bodies[0].max_tokens);
    for (const body of bodies) {
      // Matthew 6 has cross-references, so the request carries RELATED VERSES and the rule (ADR-0015, switch on).
      expect(body.messages![0]).toEqual({ role: 'system', content: `${SCOPE_GUARD}\n\n${askSystemText(LEGACY_CONTENT_LANGUAGE, true)}` });
      expect(body).not.toHaveProperty('content_language');
    }
  });

  test('an error event inside a 200 stream (on every attempt) → the bilingual error line with message and code', async ({ page }) => {
    await injectApiKey(page);
    await mockOpenRouterSequence(page, [
      { sse: sseBody([{ error: { message: 'Provider returned error', code: 502 } }]) },
    ]);
    await askOnDiscussionSlide(page);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(`${AI_STREAM_ERROR} (502): Provider returned error`);
    await expect(alert.getByRole('button', { name: TV_RETRY })).toBeVisible();
  });
});
