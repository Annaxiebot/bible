/**
 * opencc-split.spec.ts — a 简 reader never downloads the 简→繁 dictionary · 简繁词典按需加载
 *
 * OpenCC is split by direction (services/chineseDictionary): the reader loads
 * opencc-js/t2cn (38 KB gzip) for 简, and opencc-js/cn2t (447 KB gzip) only
 * on the first 繁 request. Requests are watched on the browser context, which
 * includes the converter worker's own imports; the t2cn request and the cn2t
 * request after 繁 are the controls that the watch sees them at all.
 */
import { test, expect } from '@playwright/test';
import {
  blockExternalApis, openMatthew7, zhColumn, MATT7_1_SIMPLIFIED, MATT7_1_TRADITIONAL,
} from './helpers/reader';

/** Quiet time after start-up before "cn2t was never requested" means anything. */
const SETTLE_MS = 1500;

test('简 loads only the 繁→简 table; the first 繁 loads the 简→繁 table and converts', async ({ page, context }) => {
  await blockExternalApis(context);
  const requested: string[] = [];
  context.on('request', request => { requested.push(request.url()); });
  const seen = (dictionary: 't2cn' | 'cn2t') => requested.some(url => url.includes(dictionary));

  await openMatthew7(page);
  await expect(zhColumn(page)).toContainText(MATT7_1_SIMPLIFIED);
  // The start-up preload (on idle) and the 简 conversions request t2cn…
  await expect.poll(() => seen('t2cn'), { timeout: 15_000 }).toBe(true);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(SETTLE_MS);
  // …and nothing asks for cn2t.
  expect(requested.filter(url => url.includes('cn2t'))).toEqual([]);

  await page.getByRole('group', { name: '中文字体' }).getByRole('button', { name: '繁' }).click();
  await expect(zhColumn(page)).toContainText(MATT7_1_TRADITIONAL);
  expect(seen('cn2t')).toBe(true);
});
