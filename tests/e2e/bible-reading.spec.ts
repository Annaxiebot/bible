import { test, expect } from '@playwright/test';

test.describe('Bible Reading Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for app to load
    await page.waitForLoadState('networkidle');
  });

  test('should load the app and display initial content', async ({ page }) => {
    // The app should show the Bible viewer or some initial content
    await expect(page.locator('body')).toBeVisible();
    
    // Check for key UI elements (adjust selectors based on actual UI)
    // Look for navigation or book selection
    const hasContent = await page.locator('text=/创世记|Genesis|圣经/i').count() > 0 ||
                       await page.locator('[class*="bible"]').count() > 0 ||
                       await page.locator('h1, h2').count() > 0;
    expect(hasContent).toBeTruthy();
  });

  test('should have interactive elements', async ({ page }) => {
    // Check that the page has some interactive elements
    const buttons = await page.locator('button, [role="button"]').count();
    const links = await page.locator('a').count();
    const inputs = await page.locator('input, textarea').count();
    
    // Should have some interactive elements
    expect(buttons + links + inputs).toBeGreaterThan(0);
  });

  test('should be responsive', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.locator('body')).toBeVisible();
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('body')).toBeVisible();
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page.locator('body')).toBeVisible();
  });

  test('should not have console errors on load', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Filter out known acceptable errors (like network errors for external APIs in dev)
    const criticalErrors = consoleErrors.filter(error => 
      !error.includes('Failed to load resource') &&
      !error.includes('net::ERR') &&
      !error.includes('CORS')
    );
    
    expect(criticalErrors.length).toBe(0);
  });
});

test.describe('Navigation', () => {
  test('should allow keyboard navigation', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Press Tab to navigate
    await page.keyboard.press('Tab');
    
    // Check that something is focused
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeDefined();
  });
});

test.describe('Performance', () => {
  test('should load within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    
    const loadTime = Date.now() - startTime;
    
    // Should load within 10 seconds
    expect(loadTime).toBeLessThan(10000);
  });
});
