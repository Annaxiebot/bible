#!/usr/bin/env node
/**
 * render-og-image.mjs — renders the social-share card to public/og-image.png · 分享图渲染
 *
 *   node scripts/seo/render-og-image.mjs
 *
 * Run after changing scripts/seo/ogCard.ts or a string it shows; until then
 * scripts/__tests__/ogImage.test.ts fails (the PNG records the sha256 of the
 * card it came from). Needs network for the card's web fonts (霞鹜文楷 LXGW
 * WenKai, Fraunces, Inter — SIL OFL 1.1) and Playwright's Chromium
 * (`npx playwright install chromium`). Exits non-zero, writing nothing, if a
 * font did not load: a fallback-font card must never be committed.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// The card and the PNG helpers are TypeScript importing the app's string modules: bundle them for Node.
const bundled = await build({
  stdin: {
    contents: "export * from './scripts/seo/ogCard.ts';\nexport * from './scripts/seo/ogImage.ts';\n",
    resolveDir: ROOT,
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});
const modFile = path.join(mkdtempSync(path.join(tmpdir(), 'og-card-')), 'og.mjs');
writeFileSync(modFile, bundled.outputFiles[0].text);
const og = await import(pathToFileURL(modFile).href);

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: og.OG_IMAGE_WIDTH, height: og.OG_IMAGE_HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(og.ogCardHtml(), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family.replace(/["']/g, '')));
  const missing = og.OG_CARD_FONT_FAMILIES.filter(family => !loaded.includes(family));
  if (missing.length) throw new Error(`fonts not loaded: ${missing.join(', ')} (loaded: ${[...new Set(loaded)].join(', ') || 'none'})`);
  const hash = og.ogCardHash();
  const png = og.withPngText(await page.screenshot({ type: 'png' }), og.OG_CARD_HASH_KEY, hash);
  if (og.pngText(png)[og.OG_CARD_HASH_KEY] !== hash) throw new Error('card hash did not round-trip through the PNG');
  const out = path.join(ROOT, 'public', og.OG_IMAGE_FILE);
  writeFileSync(out, png);
  process.stdout.write(`wrote ${path.relative(ROOT, out)} (${png.length} bytes, card ${hash.slice(0, 12)}…)\n`);
} finally {
  await browser.close();
}
