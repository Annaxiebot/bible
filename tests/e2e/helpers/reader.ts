/**
 * reader.ts — shared helpers for the Bible-reader e2e specs · 阅读器测试辅助
 *
 * One copy (R3) used by review-2026-10, reader-phone-header and opencc-split.
 * Every external API is blocked; the reader opens Matthew 7 from the bundled
 * CUV + BSB text, so no network beyond the dev server is needed.
 */
import { BrowserContext, Page } from '@playwright/test';
import { APP_HASH } from '../../../components/landing/landingRoute';

const MATT7_LAST_READ = JSON.stringify({ bookId: 'MAT', bookName: '马太福音 Matthew', chapter: 7, timestamp: 1 });

/** bible-api.com, Supabase and OpenRouter never answer in these specs. */
export async function blockExternalApis(context: BrowserContext) {
  await context.route(/bible-api\.com|supabase\.co|openrouter\.ai|\/bible-api\//, route => route.abort());
}

/** Open the reader at Matthew 7, with extra localStorage preferences (e.g. bibleChineseScript). */
export async function openMatthew7(page: Page, prefs: Record<string, string> = {}) {
  await page.addInitScript(([lastRead, extra]) => {
    localStorage.setItem('bibleLastRead', lastRead as string);
    for (const [k, v] of Object.entries(extra as Record<string, string>)) localStorage.setItem(k, v);
  }, [MATT7_LAST_READ, prefs] as const);
  await page.goto(`./${APP_HASH}`);
}

export const zhColumn = (page: Page) => page.getByTestId('reader-column-chinese');
export const enColumn = (page: Page) => page.getByTestId('reader-column-english');

/** Matthew 7:1 in each script (bundled CUV is Simplified). */
export const MATT7_1_SIMPLIFIED = '你们不要论断人，免得你们被论断。';
export const MATT7_1_TRADITIONAL = '你們不要論斷人，免得你們被論斷。';
