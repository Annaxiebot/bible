/**
 * emailStyle.ts — the site's paper look, as literal values for email · 邮件样式常量
 *
 * Mail clients cannot read CSS variables or load the site's stylesheets, so
 * the few values the HTML email uses live here once (R3) and a test pins
 * each colour equal to its token in styles/stlTheme.css and the brand words
 * to components/landing/landingStrings.ts (Deno cannot import the app's
 * extensionless modules). Fonts are stacks of installed faces only: webfonts
 * are unreliable in mail, so nothing depends on them.
 */

/** Colour per stlTheme.css token (the key is the token name without "--stl-"). */
export const EMAIL_COLORS = {
  paper: '#faf8f2',       // --stl-paper: page background
  'paper-2': '#f3efe4',   // --stl-paper-2: the whole-passage band
  card: '#ffffff',        // --stl-card: the practice/question card
  ink: '#1d2430',         // --stl-ink: body text
  'ink-2': '#4a5260',     // --stl-ink-2: English lines, verse numbers, footer
  line: '#e2dccb',        // --stl-line: hairlines, card border
  'gold-deep': '#7a5518', // --stl-gold-deep: small gold text (labels, brand)
  cta: '#d4ad5c',         // --stl-cta: the pill button, the key verse's left border
} as const;

/** Headings: 霞鹜文楷 when installed, then the system Song faces. */
export const EMAIL_HEAD_FONT = "'LXGW WenKai', 'Songti SC', 'Noto Serif SC', serif";
/** Verse text: the landing's scripture stack (styles/stlShared.css --stl-font-scripture). */
export const EMAIL_SCRIPTURE_FONT = "'Songti SC', 'STSong', 'Noto Serif SC', serif";
/** Body: the system sans faces, CJK included. */
export const EMAIL_BODY_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', Roboto, Arial, sans-serif";

/** Body type ≥ 17px (seniors, phones); the column never wider than 600px. */
export const EMAIL_BODY_PX = 17;
export const EMAIL_MAX_WIDTH_PX = 600;

/** The header wordmark; equal to landingStrings BRAND_EN / BRAND_ZH (the wordmark stays English-first). */
export const EMAIL_BRAND_EN = 'Scripture to Life';
export const EMAIL_BRAND_ZH = '活出神的话';
