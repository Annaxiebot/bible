/**
 * review-2026-10.spec.ts — browser checks for the October 2026 site review fixes.
 *
 * Safe by construction: every external API (bible-api.com, Supabase,
 * OpenRouter) is blocked; chapter failures are injected with local routes.
 * No sign-in, no AI request, no sign-up is ever made.
 */
import { test, expect } from '@playwright/test';
import { APP_HASH, SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import {
  GROUP_CTA, NEW_STUDY_SIGNIN_NOTE, PERSONAL_CTA,
} from '../../components/landing/landingStrings';
import { blockExternalApis, openMatthew7, zhColumn, enColumn } from './helpers/reader';
import { MAIN_CONTENT_ID } from '../../components/shared/skipLinkStrings';

test.beforeEach(async ({ context }) => { await blockExternalApis(context); });

test.describe('reader — editions, script, partial failures', () => {
  test('a stale saved CUNP preference reads CUV; the Chinese selector offers CUV only', async ({ page }) => {
    await openMatthew7(page, { bibleChineseVersion: 'cunp' });
    await expect(zhColumn(page)).toContainText('你们不要论断人');
    const options = await page.getByTitle('中文版本').locator('option').allTextContents();
    expect(options.join(' ')).not.toMatch(/CUNP/);
    await expect(enColumn(page)).toContainText('Do not judge');
  });

  test('繁 really converts the bundled (Simplified) CUV text, and 简 converts back', async ({ page }) => {
    await openMatthew7(page);
    await expect(zhColumn(page)).toContainText('你们不要论断人，免得你们被论断。');
    const script = page.getByRole('group', { name: '中文字体' });
    await expect(script.getByRole('button', { name: '简' })).toHaveAttribute('aria-pressed', 'true');
    await script.getByRole('button', { name: '繁' }).click();
    await expect(script.getByRole('button', { name: '繁' })).toHaveAttribute('aria-pressed', 'true');
    await expect(zhColumn(page)).toContainText('你們不要論斷人，免得你們被論斷。');
    await expect(zhColumn(page).locator('[lang="zh-Hant"]').first()).toBeVisible();
    // Survives a reload (persisted), then back to 简.
    await page.reload();
    await expect(zhColumn(page)).toContainText('你們不要論斷人');
    await page.getByRole('group', { name: '中文字体' }).getByRole('button', { name: '简' }).click();
    await expect(zhColumn(page)).toContainText('你们不要论断人');
  });

  test('a failing Chinese chapter keeps the English column; retry restores Chinese only', async ({ page }) => {
    let failChinese = true;
    await page.route('**/bible-data/cuv/MAT/7.json', route =>
      failChinese ? route.fulfill({ status: 500, body: 'boom' }) : route.fallback());
    await openMatthew7(page);
    const error = page.getByTestId('reader-column-error-chinese');
    await expect(error).toBeVisible();
    await expect(error).toContainText('无法加载中文经文');
    await expect(enColumn(page)).toContainText('Do not judge, or you will be judged.');
    await expect(page.getByTestId('reader-column-error-english')).toHaveCount(0);

    failChinese = false;
    await error.getByRole('button', { name: '重试' }).click();
    await expect(zhColumn(page)).toContainText('你们不要论断人');
    await expect(enColumn(page)).toContainText('Do not judge');
  });

  test('a failing English edition keeps the Chinese column', async ({ page }) => {
    // KJV is not bundled → bible-api.com, which is blocked here.
    await openMatthew7(page, { bibleEnglishVersion: 'kjv' });
    await expect(page.getByTestId('reader-column-error-english')).toBeVisible();
    await expect(zhColumn(page)).toContainText('你们不要论断人');
  });

  test('English interface: chapter options, labels and errors are English; the text is unchanged', async ({ page }) => {
    await page.route('**/bible-data/cuv/MAT/7.json', route => route.fulfill({ status: 500, body: 'x' }));
    await openMatthew7(page, { bibleUiLanguage: 'en' });
    await expect(page.getByRole('combobox', { name: 'Chapter' }).locator('option').first()).toHaveText('Chapter 1');
    await expect(page.getByRole('button', { name: 'Previous chapter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search verses' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reading history' })).toBeVisible();
    await expect(page.getByPlaceholder('Search books…')).toBeVisible();
    const error = page.getByTestId('reader-column-error-chinese');
    await expect(error).toContainText("Couldn't load the Chinese text of Matthew 7");
    await expect(error.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(enColumn(page)).toContainText('Do not judge');
  });

  test('the English edition follows across tabs (shared preference, storage event)', async ({ context }) => {
    const a = await context.newPage();
    await openMatthew7(a);
    const b = await context.newPage();
    await b.goto(`./${APP_HASH}`);
    const selectB = b.getByTitle('English version');
    await expect(selectB).toHaveValue('bsb');
    await a.getByTitle('English version').selectOption('web');
    await expect(selectB).toHaveValue('web');
    expect(await selectB.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value)))
      .toEqual(['bsb', 'web', 'kjv', 'asv', 'bbe', 'ylt']);
  });
});

test.describe('landing — copy, disclosure, keyboard', () => {
  test('hero: no "no sign-in" note, New study discloses Google-or-email sign-in, skip link focuses main', async ({ page }) => {
    await page.goto('./');
    const sample = page.getByTestId('hero-sample');
    await expect(sample).toHaveAccessibleName(GROUP_CTA);
    await expect(page.getByTestId('landing-page')).not.toContainText(/无需登录|No sign-in needed/);
    await expect(page.getByTestId('hero-new-study')).toHaveAccessibleDescription(NEW_STUDY_SIGNIN_NOTE);
    await expect(page.getByTestId('personal-open')).toHaveAccessibleName(PERSONAL_CTA);

    await page.keyboard.press('Tab');
    const skip = page.getByTestId('skip-link');
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator(`main#${MAIN_CONTENT_ID}`)).toBeFocused();
    expect(new URL(page.url()).hash).toBe('');
    // Exactly one app tree: the static fallback was replaced, not duplicated.
    await expect(page.locator('#stl-fallback')).toHaveCount(0);
    await expect(page.locator('main')).toHaveCount(1);
  });

  test('delivered head carries description, canonical, Open Graph and Twitter tags, Chinese first', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /into a group study/);
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /bilingual group study/);
    // Chinese first in what a share preview shows (owner, 2026-10-23).
    for (const sel of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]', 'meta[property="og:image:alt"]']) {
      await expect(page.locator(sel)).toHaveAttribute('content', /^[\u3400-\u9fff]/);
    }
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\/scripturetolife\.org\//);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.png$/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  });

  test('signed out, the sample presentation opens and Ask AI shows its sign-in requirement', async ({ page }) => {
    await page.goto(`./#/pack/${SAMPLE_PACK_ID}`);
    await expect(page.getByText('不要忧虑 Do Not Be Anxious').first()).toBeVisible();
    await expect(page.getByTestId('tv-ask-signin-note')).toBeVisible();
    await expect(page).toHaveTitle(/不要忧虑 Do Not Be Anxious.*Scripture to Life/);
  });
});

test.describe('static study pages, sitemap, robots', () => {
  test('the study page has real bilingual content and opens the interactive presentation', async ({ page }) => {
    const res = await page.goto(`./studies/${SAMPLE_PACK_ID}/`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(/不要忧虑 Do Not Be Anxious/);
    await expect(page.locator('h1')).toContainText('Do Not Be Anxious');
    await expect(page.locator('table.verses tbody tr')).toHaveCount(10);
    await expect(page.locator('td[lang="en"]').first()).toContainText('do not worry about your life');
    await page.getByTestId('open-presentation').click();
    await expect(page.getByText('不要忧虑 Do Not Be Anxious').first()).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#/pack/${SAMPLE_PACK_ID}`);
  });

  test('sitemap.xml and robots.txt are served', async ({ request, baseURL }) => {
    const sitemap = await request.get(`${baseURL}sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain(`/studies/${SAMPLE_PACK_ID}/</loc>`);
    const robots = await request.get(`${baseURL}robots.txt`);
    expect(await robots.text()).toMatch(/Sitemap: https:\/\/scripturetolife\.org\/.*sitemap\.xml/);
    const og = await request.get(`${baseURL}og-image.png`);
    expect(og.headers()['content-type']).toBe('image/png');
  });
});
