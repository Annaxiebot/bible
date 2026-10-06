/**
 * journal-ai-errors.spec.ts — the journal's AI actions, signed out · 日记AI：未登录
 *
 * A signed-out visitor (no own key, no session) clicks a journal AI action:
 * services/studyAI → aiTransport answers sign-in-needed without any network,
 * and the journal shows the shared sign-in line next to the toolbar, whose
 * 设置AI button opens the AI service dialog at its sign-in prompt. Before
 * the fix the click did nothing visible. Nothing is mocked except a guard
 * that counts (and aborts) any AI request — there must be none.
 */
import { test, expect } from '@playwright/test';
import { APP_HASH } from '../../components/landing/landingRoute';
import { SETUP_TITLE, SETUP_SIGN_IN_TO_USE_AI, SETUP_OPEN_BUTTON } from '../../components/setup/setupStrings';
import { AI_SIGN_IN_NEEDED } from '../../components/studypack/tvHints';
import { AI_PROXY_FUNCTION } from '../../services/aiProxyRoute';
import { failOnOpenRouter } from './helpers/hostedAI';

test('signed out: Reflect and Summarize show the sign-in line; 设置AI opens the AI service dialog; no AI request is made', async ({ page }) => {
  const openRouterHits = await failOnOpenRouter(page);
  let proxyHits = 0;
  await page.route(`**/functions/v1/${AI_PROXY_FUNCTION}`, route => { proxyHits++; return route.abort(); });

  await page.goto(`/${APP_HASH}`);
  await page.waitForLoadState('networkidle');
  await page.locator('[data-testid="layout-btn-notes"]').click();
  await page.locator('button[title="New entry"]').first().click();

  await page.getByTitle('Reflect').click();
  const reflectLine = page.getByTestId('journal-ai-error-reflect');
  await expect(reflectLine.getByRole('alert')).toContainText(AI_SIGN_IN_NEEDED);
  await expect(page.getByTitle('Reflect')).toBeEnabled();      // the busy state ended

  // Summarize needs text in the entry: type some, then click it.
  await page.locator('[contenteditable="true"]').first().click();
  await page.keyboard.type('Today I learned that grace is a gift I cannot earn.');
  await expect(page.getByTitle('Summarize')).toBeEnabled();
  await page.getByTitle('Summarize').click();
  const summaryLine = page.getByTestId('journal-ai-error-summary');
  await expect(summaryLine.getByRole('alert')).toContainText(AI_SIGN_IN_NEEDED);

  await summaryLine.getByRole('button', { name: SETUP_OPEN_BUTTON }).click();
  await expect(page.getByRole('dialog', { name: SETUP_TITLE }).getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeVisible();

  expect(openRouterHits()).toBe(0);
  expect(proxyHits).toBe(0);
});
