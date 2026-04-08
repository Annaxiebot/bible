import { test, expect } from '@playwright/test';

// Emulate iPhone 12 with Chromium (WebKit not installed)
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
});

test.describe('AI Chat - Mobile Touch', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('text=AI Chat');
    await page.waitForTimeout(500);
  });

  test('should work on mobile viewport', async ({ page }) => {
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('thread selection should work with single tap on mobile', async ({ page }) => {
    // Send a message to create content
    const textarea = page.locator('textarea');
    await textarea.fill('mobile test');
    await textarea.press('Enter');
    await page.waitForTimeout(3000);

    // Open history
    await page.click('text=History');
    await page.waitForTimeout(500);

    const threadItems = page.locator('.overflow-y-auto >> .rounded-lg.cursor-pointer');
    const threadCount = await threadItems.count();

    if (threadCount > 0) {
      // Record current messages before tap
      const msgsBefore = await page.locator('.justify-start, .justify-end').count();

      // Use tap (touch) instead of click
      await threadItems.first().tap();
      await page.waitForTimeout(1000);

      // Thread should be selected after single tap (indigo background)
      await expect(threadItems.first()).toHaveClass(/bg-indigo-50/);
    }
  });

  test('delete button should not block thread tap on mobile', async ({ page }) => {
    // Send a message to create a thread with content
    const textarea = page.locator('textarea');
    await textarea.fill('delete button test');
    await textarea.press('Enter');
    await page.waitForTimeout(3000);

    // Open history
    await page.click('text=History');
    await page.waitForTimeout(500);

    const threadItems = page.locator('.overflow-y-auto >> .rounded-lg.cursor-pointer');
    if (await threadItems.count() > 0) {
      // On mobile, the delete button should be hidden (not intercepting taps)
      const deleteBtn = threadItems.first().locator('button svg');
      const deleteBtnVisible = await deleteBtn.isVisible().catch(() => false);

      // Tap the thread
      await threadItems.first().tap();
      await page.waitForTimeout(500);

      // Should be selected — NOT showing delete confirmation
      const confirmDelete = page.locator('text=Delete');
      const hasConfirmDelete = await confirmDelete.isVisible().catch(() => false);
      // If the delete button intercepted the tap, it would show "Delete" confirmation
      // instead of selecting the thread
      expect(hasConfirmDelete).toBeFalsy();
    }
  });
});
