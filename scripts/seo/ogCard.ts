/**
 * ogCard.ts — the HTML the social-share image is rendered from · 分享图卡片
 *
 * scripts/seo/render-og-image.mjs opens this card at 1200×630 in headless
 * Chromium and saves public/og-image.png. Chinese first and largest
 * (owner, 2026-10-23): 活出神的话, then Scripture to Life, then
 * 小组查经 · Group Bible study and the domain. The landing hero's night
 * colours and concentric gold rings; the site's own heading fonts, all
 * SIL Open Font License 1.1: 霞鹜文楷 LXGW WenKai Bold (Chinese), Fraunces
 * (the wordmark), Inter (English). Every word comes from landingStrings (R3).
 */
import { createHash } from 'node:crypto';
import { BRAND_EN, BRAND_ZH, HERO_EYEBROW } from '../../components/landing/landingStrings';
import { DEFAULT_SITE_ORIGIN, escapeHtml, splitLine } from './prerender';
import { OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT } from './ogImage';

/** Font CSS the card loads (the same sources index.html uses). */
export const OG_CARD_FONT_CSS = [
  'https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-bold.css',
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@500&display=block',
];
/** Families the renderer must see loaded before it takes the picture. */
export const OG_CARD_FONT_FAMILIES = ['LXGW WenKai', 'Fraunces', 'Inter'];

/**
 * The landing's night band and gold, per styles/stlTheme.css token (the key is the token
 * name without "--stl-"). Literal because the card is rendered on its own; a test pins
 * each value to its token, as for the emails (send-checkins/emailStyle.ts).
 */
export const OG_CARD_COLORS = {
  bg: '#151a23',            // --stl-bg: background, top
  surface: '#1c2230',       // --stl-surface: background, bottom
  'gold-pale': '#e6cd8c',   // --stl-gold-pale: 活出神的话 gradient start, 小组查经
  'gold-warm': '#c9a24f',   // --stl-gold-warm: gradient end, rings, domain
  'on-night': '#f3efe4',    // --stl-on-night: Scripture to Life
  'on-night-2': '#b8bfcc',  // --stl-on-night-2: Group Bible study
} as const;
const C = OG_CARD_COLORS;

const RING_RADII = [110, 190, 270, 350, 430, 510, 590];

function rings(): string {
  return RING_RADII.map((r, i) =>
    `<circle cx="1010" cy="315" r="${r}" fill="none" stroke="${C['gold-warm']}" stroke-width="2.5" stroke-opacity="${(0.55 - i * 0.07).toFixed(2)}"/>`,
  ).join('');
}

export function ogCardHtml(): string {
  const eyebrow = splitLine(HERO_EYEBROW);
  const host = new URL(DEFAULT_SITE_ORIGIN).host;
  const e = escapeHtml;
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
<meta charset="UTF-8">
${OG_CARD_FONT_CSS.map(href => `<link rel="stylesheet" href="${e(href)}">`).join('\n')}
<style>
  html, body { margin: 0; width: ${OG_IMAGE_WIDTH}px; height: ${OG_IMAGE_HEIGHT}px; overflow: hidden; }
  body { position: relative; background: linear-gradient(160deg, ${C.bg} 0%, ${C.surface} 100%); }
  svg { position: absolute; inset: 0; }
  .text { position: absolute; left: 88px; top: 0; bottom: 0; display: flex; flex-direction: column; justify-content: center; }
  .zh { font-family: 'LXGW WenKai', serif; font-weight: 700; font-size: 150px; line-height: 1.1; letter-spacing: 0.04em;
        background: linear-gradient(90deg, ${C['gold-pale']}, ${C['gold-warm']}); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .en { font-family: 'Fraunces', serif; font-weight: 600; font-size: 68px; color: ${C['on-night']}; margin-top: 18px; }
  .eyebrow { margin-top: 34px; font-size: 40px; color: ${C['on-night-2']}; }
  .eyebrow [lang="zh-Hans"] { font-family: 'LXGW WenKai', serif; font-weight: 700; color: ${C['gold-pale']}; }
  .eyebrow [lang="en"] { font-family: 'Inter', sans-serif; font-weight: 500; }
  .host { position: absolute; left: 88px; bottom: 52px; font-family: 'Inter', sans-serif; font-weight: 500; font-size: 26px; color: ${C['gold-warm']}; letter-spacing: 0.04em; }
</style>
</head>
<body>
<svg width="${OG_IMAGE_WIDTH}" height="${OG_IMAGE_HEIGHT}" aria-hidden="true">${rings()}</svg>
<div class="text">
  <div class="zh" data-part="brand-zh">${e(BRAND_ZH)}</div>
  <div class="en" lang="en" data-part="brand-en">${e(BRAND_EN)}</div>
  <div class="eyebrow" data-part="eyebrow"><span lang="zh-Hans">${e(eyebrow.zh)}</span> · <span lang="en">${e(eyebrow.en)}</span></div>
</div>
<div class="host" lang="en">${e(host)}</div>
</body>
</html>
`;
}

/** sha256 of the card HTML — public/og-image.png records the one it was rendered from. */
export function ogCardHash(): string {
  return createHash('sha256').update(ogCardHtml()).digest('hex');
}
