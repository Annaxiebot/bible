/**
 * tv-ask-ai-failures.spec.ts — Ask AI failures are impossible to miss · 问AI失败端到端
 *
 * Signed in (AI needs sign-in, ADR-0007), the ai-proxy mocked at the network
 * level (helpers/hostedAI.ts, OpenRouter's reply shapes passed through): a
 * 401 (the session expired) shows the sign-in line with Set up AI; a hung
 * request shows the timeout line with the model id and Retry; a
 * reasoning-only stream is retried with reasoning off and the retry's
 * content renders; an in-stream error event is shown bilingually. Every
 * request is the data form — no system message, the pack's mode as
 * content_language (the proxy owns the rules, ADR-0014), on the retry too.
 * Happy paths live in tv-presentation.spec.ts.
 */
import { test, expect, Page } from '@playwright/test';
import {
  AI_SIGN_IN_NEEDED, AI_TIMEOUT, AI_STREAM_ERROR, TV_RETRY, modelLine, thinkingLine,
} from '../../components/studypack/tvHints';
import { SETUP_OPEN_BUTTON } from '../../components/setup/setupStrings';
import { ASK_AI_MODEL } from '../../services/aiDefaults';
import { LEGACY_CONTENT_LANGUAGE } from '../../components/studypack/principles';
import { RELATED_VERSES_HEADING } from '../../supabase/functions/_shared/aiPrompts';
import { openTV, goToSlide, DEMO_SLIDE, setAskAITimeout, sseBody } from './helpers/tv';
import { signInAsLeader, mockAISequence, mockAIHang } from './helpers/hostedAI';

const E2E_TIMEOUT_MS = 1500;

/** Go to the "your week" discussion slide and open Ask AI (auto-sends the slide's question). */
async function askOnDiscussionSlide(page: Page) {
  await openTV(page);
  await goToSlide(page, DEMO_SLIDE.weekQuestion);
  await expect(page.getByText(/讨论 Discussion · 4\/7/)).toBeVisible();
  await page.keyboard.press('a');
  await expect(page.getByTestId('ask-question')).toContainText(/这一周，忧虑实际出现在哪里/);
}

test.describe('Ask AI failures on the TV', () => {
  test('401 (the session expired) → the bilingual sign-in line and a Set up AI button', async ({ page }) => {
    await signInAsLeader(page);
    await mockAISequence(page, [{ status: 401, message: 'unauthorized' }]);
    await askOnDiscussionSlide(page);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(AI_SIGN_IN_NEEDED);
    await expect(alert.getByRole('button', { name: SETUP_OPEN_BUTTON })).toBeVisible();
    await expect(alert.getByRole('button', { name: TV_RETRY })).toHaveCount(0);
  });

  test('a hung request → thinking line names the model, then the timeout line with model id, Retry and Set up AI', async ({ page }) => {
    await signInAsLeader(page);
    await setAskAITimeout(page, E2E_TIMEOUT_MS);
    await mockAIHang(page);
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
    await signInAsLeader(page);
    const mock = await mockAISequence(page, [
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
    await expect(page.getByTestId('ask-backup-model')).toHaveCount(0); // the retry used the main model: no model line
    await expect(page.getByRole('alert')).toHaveCount(0);
    const bodies = mock.bodies();
    expect(bodies).toHaveLength(2);
    expect(bodies[0].reasoning).toBeUndefined();
    expect(bodies[1].reasoning).toEqual({ enabled: false, exclude: true });
    expect(bodies[1].max_tokens).toBeGreaterThan(bodies[0].max_tokens);
    for (const body of bodies) {
      // The data form: no system message (the proxy adds it), the pack's mode, role ask; Matthew 6 has cross-references, so RELATED VERSES ride along.
      expect(body).toMatchObject({ role: 'ask', content_language: LEGACY_CONTENT_LANGUAGE });
      expect(body.messages!.filter(m => m.role === 'system')).toHaveLength(0);
      expect(body.messages!.at(-1)!.content).toContain(`${RELATED_VERSES_HEADING} (`);
    }
  });

  test('an error event inside a 200 stream (on every attempt) → the bilingual error line with message and code', async ({ page }) => {
    await signInAsLeader(page);
    await mockAISequence(page, [
      { sse: sseBody([{ error: { message: 'Provider returned error', code: 502 } }]) },
    ]);
    await askOnDiscussionSlide(page);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(`${AI_STREAM_ERROR} (502): Provider returned error`);
    await expect(alert.getByRole('button', { name: TV_RETRY })).toBeVisible();
  });
});
