/**
 * personal-sync.spec.ts — the #app sync line, both states · 个人应用同步状态
 *
 * Signed out (the dev server has no Supabase): the sidebar's one line says
 * the data stays in this browser, and "导出 Export" downloads ONE JSON file
 * of everything stored locally (ADR-0010). Signed in (the dev-only
 * window.__LEADER_E2E__ seam, services/e2eLeader): the line says synced.
 */
import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { APP_HASH } from '../../components/landing/landingRoute';
import { SYNC_LINE_LOCAL, SYNC_LINE_SYNCED } from '../../components/syncLineStrings';
import { PERSONAL_BACKUP_KIND, PERSONAL_BACKUP_VERSION } from '../../services/export/personalBackupFormat';
import { fakeLeaderSession } from './helpers/leader';

async function openSidebar(page: Page) {
  await page.goto(`/${APP_HASH}`);
  await page.getByRole('button', { name: '菜单 Menu' }).click();
  const line = page.getByTestId('sync-line');
  await line.scrollIntoViewIfNeeded();
  await expect(line).toBeInViewport();
}

test('signed out: one local-only line, and Export downloads all my data as one JSON file', async ({ page }) => {
  await openSidebar(page);
  await expect(page.getByTestId('sync-line-local')).toHaveText(SYNC_LINE_LOCAL);
  await expect(page.getByTestId('sync-line-signed-in')).toHaveCount(0);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('sync-line-export').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^bible-app-my-data-\d{4}-\d\d-\d\d\.json$/);
  const file = JSON.parse(readFileSync((await download.path())!, 'utf8'));
  expect(file.kind).toBe(PERSONAL_BACKUP_KIND);
  expect(file.version).toBe(PERSONAL_BACKUP_VERSION);
  for (const section of ['notes', 'verseData', 'annotations', 'bookmarks', 'journal', 'chatHistory', 'spiritualMemory', 'settings']) {
    expect(file, section).toHaveProperty(section);
  }
  expect(JSON.stringify(file)).not.toMatch(/api_key/i);
});

test('signed in (same session as the leader pages): the line says synced', async ({ page }) => {
  await fakeLeaderSession(page);
  await openSidebar(page);
  await expect(page.getByTestId('sync-line-signed-in')).toContainText(SYNC_LINE_SYNCED);
  await expect(page.getByTestId('sync-line-local')).toHaveCount(0);
  await expect(page.getByTestId('sync-line-export')).toHaveCount(0);
});
