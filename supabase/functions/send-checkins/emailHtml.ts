/**
 * emailHtml.ts — the check-in email as HTML, in the site's paper style · 邮件 HTML
 *
 * Pure (vitest-covered). Renders the same CheckinContent as the plain-text
 * part (templates.checkinText), Chinese first everywhere. Email-client
 * safety: one 600px table column, every style inline, no <style> reliance,
 * no images, no script; every interpolated string passes through escapeHtml.
 * No raw URL is ever shown — the check-in link is a gold pill button, the
 * stop link a small text link, and the passage reference links nowhere (a
 * member has no public page for a leader's pack).
 */
import type { CheckinContent, PassageVerse } from './templates.ts';
import {
  EMAIL_COLORS as C, EMAIL_HEAD_FONT, EMAIL_SCRIPTURE_FONT, EMAIL_BODY_FONT, EMAIL_BODY_PX, EMAIL_MAX_WIDTH_PX,
  EMAIL_BRAND_EN, EMAIL_BRAND_ZH,
} from './emailStyle.ts';
import { FULL_PASSAGE_HEADING, PASSAGE_LABEL, PRACTICE_LABEL, SITE_ORIGIN, LINK_LABEL } from './messageStrings.ts';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** The one escape for text and attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ESCAPES[ch]);
}

const BODY = `font-family:${EMAIL_BODY_FONT};font-size:${EMAIL_BODY_PX}px;line-height:1.6;color:${C.ink};`;
const SMALL_LABEL = `margin:0 0 6px;font-size:14px;letter-spacing:0.02em;color:${C['gold-deep']};font-weight:600;`;

function row(inner: string, style = ''): string {
  return `<tr><td style="padding:0 24px 20px;${style}">${inner}</td></tr>`;
}

function header(): string {
  return `<tr><td style="padding:28px 24px 18px;border-bottom:1px solid ${C.line};">`
    + `<p style="margin:0;font-family:${EMAIL_HEAD_FONT};font-size:16px;font-weight:700;color:${C['gold-deep']};">`
    + `${escapeHtml(EMAIL_BRAND_EN)} · ${escapeHtml(EMAIL_BRAND_ZH)}</p></td></tr>`;
}

/** The rounded card: the member's practices (+ own version), then the question. */
function card(c: CheckinContent): string {
  const practices = c.practices.length
    ? `<p style="${SMALL_LABEL}">${escapeHtml(PRACTICE_LABEL)}</p>`
      + c.practices.map(p => `<p style="margin:0 0 6px;">${escapeHtml(p)}</p>`).join('')
    : '';
  const own = c.ownVersion ? `<p style="margin:0 0 6px;color:${C['ink-2']};">${escapeHtml(c.ownVersion)}</p>` : '';
  const divider = practices || own ? `<div style="height:1px;background:${C.line};margin:14px 0;"></div>` : '';
  const question = `<p style="margin:0;font-family:${EMAIL_HEAD_FONT};font-size:20px;line-height:1.5;font-weight:700;">${escapeHtml(c.prompt)}</p>`;
  return row(`<div style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:20px 22px;">`
    + `${practices}${own}${divider}${question}</div>`);
}

/** "本周经文 · This week's passage" + the ref, and the key verse as a gold-bordered quote. */
function passageHead(c: CheckinContent): string {
  if (!c.passage) return '';
  const ref = c.passage.ref
    ? row(`<p style="${SMALL_LABEL}">${escapeHtml(PASSAGE_LABEL)}</p><p style="margin:0;font-weight:600;">${escapeHtml(c.passage.ref)}</p>`)
    : '';
  const key = c.passage.keyVerse;
  const quote = key
    ? row(`<div style="border-left:4px solid ${C.cta};padding:4px 0 4px 16px;">`
      + `<p style="margin:0 0 8px;font-family:${EMAIL_SCRIPTURE_FONT};font-size:19px;line-height:1.7;">「${escapeHtml(key.cuv)}」<span style="font-size:14px;color:${C['ink-2']};">(v.${key.num})</span></p>`
      + `<p style="margin:0;color:${C['ink-2']};font-style:italic;">“${escapeHtml(key.en)}” <span style="font-size:14px;font-style:normal;">(v.${key.num})</span></p></div>`)
    : '';
  return ref + quote;
}

/** The gold pill (a bulletproof table button; the URL lives only in href). */
function button(url: string, label: string): string {
  return row(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="background:${C.cta};border-radius:999px;">`
    + `<a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:${EMAIL_BODY_FONT};font-size:18px;font-weight:700;color:${C.ink};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>`
    + `</td></tr></table>`, 'padding-top:4px;');
}

function verseRow(v: PassageVerse): string {
  return `<p style="margin:0 0 12px;"><span style="font-size:12px;color:${C['ink-2']};vertical-align:top;">${v.num}</span> `
    + `<span style="font-family:${EMAIL_SCRIPTURE_FONT};">${escapeHtml(v.cuv)}</span><br>`
    + `<span style="color:${C['ink-2']};">${escapeHtml(v.en)}</span></p>`;
}

/** The whole passage, in a quieter band at the end. */
function passageTail(c: CheckinContent): string {
  if (!c.passage?.verses.length) return '';
  return `<tr><td style="padding:22px 24px 10px;background:${C['paper-2']};border-top:1px solid ${C.line};">`
    + `<p style="${SMALL_LABEL}">${escapeHtml(FULL_PASSAGE_HEADING)}${c.passage.ref ? ` · ${escapeHtml(c.passage.ref)}` : ''}</p>`
    + c.passage.verses.map(verseRow).join('') + `</td></tr>`;
}

function footer(c: CheckinContent): string {
  const stop = c.stopUrl
    ? `<a href="${escapeHtml(c.stopUrl)}" style="color:${C['ink-2']};text-decoration:underline;">${escapeHtml(LINK_LABEL.stop)}</a><br>`
    : '';
  return `<tr><td style="padding:18px 24px 28px;font-size:14px;line-height:1.7;color:${C['ink-2']};border-top:1px solid ${C.line};">`
    + `${stop}<a href="${escapeHtml(SITE_ORIGIN)}" style="color:${C['gold-deep']};text-decoration:none;">${escapeHtml(EMAIL_BRAND_EN)} · ${escapeHtml(EMAIL_BRAND_ZH)}</a></td></tr>`;
}

/** The whole HTML document for one message. */
export function renderCheckinHtml(c: CheckinContent): string {
  const preheader = escapeHtml(c.prompt.split('\n')[0]);
  const body = header()
    + row(`<p style="margin:0;font-family:${EMAIL_HEAD_FONT};font-size:22px;font-weight:700;">${escapeHtml(c.greeting)}</p>`, 'padding-top:22px;')
    + card(c) + passageHead(c) + button(c.link.url, c.link.label) + passageTail(c) + footer(c);
  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">'
    + `<title>${escapeHtml(c.subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${C.paper};">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.paper};"><tr><td align="center" style="padding:16px 8px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${EMAIL_MAX_WIDTH_PX}px;${BODY}">`
    + `${body}</table></td></tr></table></body></html>`;
}
