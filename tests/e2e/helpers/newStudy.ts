/**
 * newStudy.ts — shared steps for the New-study e2e specs · 新建查经测试辅助
 *
 * Open #/new, pick John 3:22–36 from the real bundled dropdowns, and chunk
 * the mocked model reply into SSE-sized pieces. The generated pack id is
 * deterministic (date + passage), so specs can address it in IndexedDB.
 */
import { expect, Page } from '@playwright/test';
import { NEW_STUDY_HASH } from '../../../components/landing/landingRoute';

export const PACK_ID = 'local-2026-10-02-jhn3';

export async function openNewStudy(page: Page) {
  await page.goto(`./${NEW_STUDY_HASH}`);
  await expect(page.getByTestId('new-study-page')).toBeVisible();
}

/** John 3 from the dropdowns: 36 verse options come from the real bundled chapter; To defaults to 36. */
export async function fillJohn3(page: Page) {
  await page.getByTestId('ns-book').selectOption('JHN');
  await page.getByTestId('ns-chapter').selectOption('3');
  await expect(page.getByTestId('ns-verse-to').locator('option')).toHaveCount(36);
  await expect(page.getByTestId('ns-verse-to')).toHaveValue('36');
  await page.getByTestId('ns-verse-from').selectOption('22');
  await page.getByTestId('ns-date').fill('2026-10-02');
}

export function chunked(text: string, size = 200): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
