import { test, expect } from '@playwright/test';

test.describe('AI Chat View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Navigate to AI Chat tab
    await page.click('text=AI Chat');
    await page.waitForTimeout(500);
  });

  test('should navigate to AI Chat tab', async ({ page }) => {
    // Verify we're on the AI Chat view
    await expect(page.locator('text=AI Chat')).toBeVisible();
    // Should have the chat input area
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('should send a message and get a response bubble', async ({ page }) => {
    const textarea = page.locator('textarea');
    await textarea.click();
    await textarea.fill('Hello test');
    await page.waitForTimeout(200);
    // Press Enter (not Shift+Enter which inserts newline)
    await page.keyboard.press('Enter');
    // Should show the user message (may take a moment to render)
    await page.waitForTimeout(2000);
    const userMsg = page.locator('.justify-end');
    await expect(userMsg.first()).toBeVisible({ timeout: 5000 });
    // Should show a response (either AI content or error message)
    await page.waitForTimeout(3000);
    const assistantMsg = page.locator('.justify-start').first();
    await expect(assistantMsg).toBeVisible({ timeout: 10000 });
  });

  test('should show action icons on assistant messages', async ({ page }) => {
    // Send a message to get a response
    const textarea = page.locator('textarea');
    await textarea.fill('test message');
    await textarea.press('Enter');
    await page.waitForTimeout(3000);

    // Assistant message should have action icons (copy, speaker, save, etc.)
    const assistantMsg = page.locator('.justify-start').first();
    await expect(assistantMsg).toBeVisible({ timeout: 10000 });

    // Should have the copy button (clipboard icon)
    const copyBtn = assistantMsg.locator('button[title="复制"], button[title="Copy"]');
    await expect(copyBtn).toBeVisible();

    // Should have the speaker button
    const speakerBtn = assistantMsg.locator('button[title="朗读"], button[title="Read aloud"]');
    await expect(speakerBtn).toBeVisible();
  });

  test('copy button should copy message content to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    // Send a message to get a response
    const textarea = page.locator('textarea');
    await textarea.fill('copy test');
    await textarea.press('Enter');
    await page.waitForTimeout(3000);

    // Click the copy button on the assistant message
    const assistantMsg = page.locator('.justify-start').first();
    await expect(assistantMsg).toBeVisible({ timeout: 10000 });
    const copyBtn = assistantMsg.locator('button[title="复制"], button[title="Copy"]');
    await copyBtn.click();

    // Verify the button changes to "Copied" state
    const copiedBtn = assistantMsg.locator('button[title="已复制"], button[title="Copied!"]');
    await expect(copiedBtn).toBeVisible({ timeout: 2000 });

    // Verify clipboard content is not empty
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.length).toBeGreaterThan(0);
  });

  test('message text should take full width (icons below)', async ({ page }) => {
    // Send a message
    const textarea = page.locator('textarea');
    await textarea.fill('layout test');
    await textarea.press('Enter');
    await page.waitForTimeout(3000);

    const assistantMsg = page.locator('.justify-start .rounded-2xl').first();
    await expect(assistantMsg).toBeVisible({ timeout: 10000 });

    // The prose content and icon row should be stacked vertically (not side-by-side)
    // Check that the prose element has full width
    const prose = assistantMsg.locator('.prose').first();
    const icons = assistantMsg.locator('.flex.justify-end').first();

    if (await prose.count() > 0 && await icons.count() > 0) {
      const proseBox = await prose.boundingBox();
      const iconsBox = await icons.boundingBox();
      if (proseBox && iconsBox) {
        // Icons should be below the text (higher Y value), not beside it
        expect(iconsBox.y).toBeGreaterThanOrEqual(proseBox.y + proseBox.height - 5);
      }
    }
  });
});

test.describe('AI Chat - Thread Switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('text=AI Chat');
    await page.waitForTimeout(500);
  });

  test('should open history panel', async ({ page }) => {
    // Click History button
    await page.click('text=History');
    await page.waitForTimeout(300);

    // Should show the thread list panel with New Chat button
    await expect(page.locator('text=New Chat')).toBeVisible();
  });

  test('thread items should be clickable on first tap', async ({ page }) => {
    // Send a message first to create a thread
    const textarea = page.locator('textarea');
    await textarea.fill('thread test message');
    await textarea.press('Enter');
    await page.waitForTimeout(3000);

    // Open history
    await page.click('text=History');
    await page.waitForTimeout(500);

    // There should be at least one thread
    const threadItems = page.locator('.overflow-y-auto >> .rounded-lg.cursor-pointer');
    const threadCount = await threadItems.count();

    if (threadCount > 0) {
      // Click the first thread item
      await threadItems.first().click();
      await page.waitForTimeout(500);

      // The thread should be selected (indigo background)
      await expect(threadItems.first()).toHaveClass(/bg-indigo-50/);
    }
  });
});

// Mobile touch tests are in ai-chat-mobile.spec.ts (separate file
// because test.use with device overrides requires a new worker)

test.describe('AI Chat - Scroll to Bottom', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('text=AI Chat');
    await page.waitForTimeout(500);
  });

  test('scroll-to-bottom button should appear when scrolled up', async ({ page }) => {
    // Send multiple messages to create scrollable content
    const textarea = page.locator('textarea');
    for (let i = 0; i < 5; i++) {
      await textarea.fill(`Scroll test message ${i + 1}`);
      await textarea.press('Enter');
      await page.waitForTimeout(2000);
    }

    // Scroll up in the chat area
    const chatArea = page.locator('.overflow-y-auto').first();
    await chatArea.evaluate(el => el.scrollTop = 0);
    await page.waitForTimeout(300);

    // The scroll-to-bottom button should appear
    const scrollBtn = page.locator('button[title="Scroll to latest"]');
    // Only check if content is long enough to scroll
    const isScrollable = await chatArea.evaluate(el => el.scrollHeight > el.clientHeight + 200);
    if (isScrollable) {
      await expect(scrollBtn).toBeVisible({ timeout: 2000 });

      // Click it and verify we scrolled to bottom
      await scrollBtn.click();
      await page.waitForTimeout(500);
      const isAtBottom = await chatArea.evaluate(el =>
        el.scrollHeight - el.scrollTop - el.clientHeight < 50
      );
      expect(isAtBottom).toBeTruthy();
    }
  });
});
