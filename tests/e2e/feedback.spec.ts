/**
 * feedback.spec.ts — landing → Feedback → send → thank-you in a real browser · 意见反馈端到端 (ADR-0011)
 *
 * The `feedback` edge function is routed with a fake that enforces the
 * real function's order (feedbackHandler): the shared validateFeedback
 * first (400 + problem code; a filled honeypot or an empty message never
 * stores), then a 5-per-window rate limit (429), else 200 + row id. No live
 * Supabase; nothing is sent anywhere. The Contribute links open the repo in
 * a new tab; GitHub is stubbed.
 */
import { test, expect, Page } from '@playwright/test';
import {
  FEEDBACK_FUNCTION, FEEDBACK_LABEL, HONEYPOT_FIELD, RATE_LIMIT_COUNT, feedbackHash, validateFeedback,
} from '../../supabase/functions/_shared/feedback';
import { FB_THANKS, FB_ERRORS } from '../../components/feedback/feedbackStrings';
import { E2E_SUPABASE_PATH, injectSupabaseOverride } from './helpers/signup';
import { SOURCE_REPO_URL, CONTRIBUTE_LABEL, CONTRIBUTE_PROMPT } from '../../components/shared/sourceRepo';

const MIN_TAP_PX = 48;

/** Clicks an external link and returns the popup it opened; GitHub is stubbed (no network). */
async function openRepoPopup(page: Page, testId: string) {
  await page.context().route(`${SOURCE_REPO_URL}**`, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>repo</p>' }));
  const link = page.getByTestId(testId);
  await expect(link).toHaveAttribute('href', SOURCE_REPO_URL);
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(MIN_TAP_PX);
  const [popup] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await popup.waitForLoadState();
  return popup;
}

async function mockFeedbackFunction(page: Page) {
  const stored: Array<Record<string, unknown>> = [];
  const seen: unknown[] = [];
  await page.route(`**${E2E_SUPABASE_PATH}/functions/v1/${FEEDBACK_FUNCTION}**`, route => {
    const json = { 'Content-Type': 'application/json' };
    if (route.request().method() !== 'POST') return route.fulfill({ status: 405, headers: json, body: '{"error":"POST only"}' });
    const body = route.request().postDataJSON();
    seen.push(body);
    const verdict = validateFeedback(body);
    if (verdict.ok === false) return route.fulfill({ status: 400, headers: json, body: JSON.stringify({ error: verdict.problem }) });
    if (stored.length >= RATE_LIMIT_COUNT) return route.fulfill({ status: 429, headers: json, body: '{"error":"rate-limited"}' });
    stored.push(verdict.value as unknown as Record<string, unknown>);
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify({ id: `row-${stored.length}`, emailed: true }) });
  });
  return { stored: () => stored, seen: () => seen };
}

test.describe('Feedback', () => {
  test('landing footer → Feedback → write + optional email → Send → thank-you; context from=landing goes along', async ({ page }) => {
    await injectSupabaseOverride(page);
    const fn = await mockFeedbackFunction(page);
    await page.goto('./');
    const link = page.getByTestId('landing-feedback-link');
    await expect(link).toHaveAttribute('href', feedbackHash('landing'));
    await link.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FEEDBACK_LABEL);

    await page.getByRole('button', { name: /发送/ }).click();   // empty: refused on the page, no request
    await expect(page.getByRole('alert')).toHaveText(FB_ERRORS['message-empty']);
    expect(fn.seen()).toHaveLength(0);

    await page.getByTestId('feedback-message').fill('字太小了 · The text is too small on my phone');
    await page.getByTestId('feedback-email').fill('member@example.com');
    await expect(page.getByTestId('feedback-honeypot')).not.toBeInViewport();
    await page.getByRole('button', { name: /发送/ }).click();
    await expect(page.getByTestId('feedback-thanks')).toHaveText(FB_THANKS);
    expect(fn.stored()).toEqual([{
      message: '字太小了 · The text is too small on my phone', email: 'member@example.com', context: { from: 'landing' },
    }]);
    expect((fn.seen()[0] as Record<string, unknown>)[HONEYPOT_FIELD]).toBe('');
  });

  test('an email link keeps from=email + pack (shown nowhere); no email → stored as null', async ({ page }) => {
    await injectSupabaseOverride(page);
    const fn = await mockFeedbackFunction(page);
    await page.goto(`./${feedbackHash('email', 'local-2026-10-02-jhn3')}`);
    await expect(page.locator('body')).not.toContainText('local-2026-10-02-jhn3');   // context is shown nowhere
    await page.getByTestId('feedback-message').fill('Thank you');
    await page.getByRole('button', { name: /发送/ }).click();
    await expect(page.getByTestId('feedback-thanks')).toBeVisible();
    expect(fn.stored()[0]).toMatchObject({ context: { from: 'email', pack: 'local-2026-10-02-jhn3' }, email: null });
  });

  test('Contribute on GitHub: landing footer and feedback page open the repo in a new tab with no opener', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('landing-contribute-link')).toHaveText(CONTRIBUTE_LABEL.replace(' · ', ''));
    const fromLanding = await openRepoPopup(page, 'landing-contribute-link');
    expect(fromLanding.url()).toBe(SOURCE_REPO_URL);
    expect(await fromLanding.evaluate(() => window.opener)).toBeNull();
    await fromLanding.close();
    await expect(page.getByTestId('landing-page')).toBeVisible();   // the site stays open behind it

    await page.goto(`./${feedbackHash('landing')}`);
    await expect(page.getByTestId('feedback-contribute-link')).toHaveText(CONTRIBUTE_PROMPT);
    const fromFeedback = await openRepoPopup(page, 'feedback-contribute-link');
    expect(fromFeedback.url()).toBe(SOURCE_REPO_URL);
  });

  test('over the hourly limit the page says so and shows no thank-you', async ({ page }) => {
    await injectSupabaseOverride(page);
    const fn = await mockFeedbackFunction(page);
    await page.goto(`./${feedbackHash('member')}`);
    for (let i = 0; i <= RATE_LIMIT_COUNT; i++) {
      if (i > 0) await page.reload();   // a fresh form each time (same URL)
      await page.getByTestId('feedback-message').fill(`note ${i}`);
      await page.getByRole('button', { name: /发送/ }).click();
      if (i < RATE_LIMIT_COUNT) await expect(page.getByTestId('feedback-thanks')).toBeVisible();
    }
    await expect(page.getByRole('alert')).toHaveText(FB_ERRORS['rate-limited']);
    await expect(page.getByTestId('feedback-thanks')).toHaveCount(0);
    expect(fn.stored()).toHaveLength(RATE_LIMIT_COUNT);
  });
});
