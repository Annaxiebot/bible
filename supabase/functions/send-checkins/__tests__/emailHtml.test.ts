/**
 * emailHtml.test.ts — the HTML check-in email · 邮件 HTML 测试
 *
 * Structure (one 600px table column, inline styles, no script/img/<style>),
 * no raw URL outside href attributes (the bare host shows once, as the
 * footer link's text), the header wordmark and footer link go home, the pill
 * button and stop link carry the right hrefs, every interpolation is escaped, the key verse and the
 * whole passage appear or vanish like the text part, Chinese before English;
 * Resend gets both parts; the style constants equal the site's tokens.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  renderCheckin, checkinPageUrl, stopPageUrl, packUrl, SITE_ORIGIN, SITE_FOOTER_LINE, WELCOME_KIND, LINK_LABEL, PASSAGE_LABEL, FULL_PASSAGE_HEADING,
  CheckinPack, MemberContext, MessageKind,
} from '../templates.ts';
import { escapeHtml } from '../emailHtml.ts';
import { packFromSummary, PackSummaryRow } from '../packSource.ts';
import { resendBody } from '../senders.ts';
import { EMAIL_COLORS, EMAIL_BRAND_EN, EMAIL_BRAND_ZH, EMAIL_BODY_PX, EMAIL_MAX_WIDTH_PX, EMAIL_SCRIPTURE_FONT, EMAIL_HEAD_FONT, EMAIL_BODY_FONT } from '../emailStyle.ts';
import { BRAND_EN, BRAND_ZH, SITE_LINE } from '../../../../components/landing/landingStrings';

const ROW: PackSummaryRow = {
  pack_id: 'local-2026-10-02-pro1', leader_id: 'uid-lead', title: '第1课 箴言 1:1–33',
  reflection_lines: ['周二 · Tue', '这周你怎样敬畏神？ · How did you fear God this week?', '周末 · Weekend'],
  passage_ref: '箴言 1:1–33 · Proverbs 1:1–33', key_verse: 7,
  verses: [
    { num: 1, cuv: '以色列王大卫儿子所罗门的箴言：', en: 'These are the proverbs of Solomon son of David, king of Israel,' },
    { num: 7, cuv: '敬畏耶和华是知识的开端；愚妄人藐视智慧和训诲。', en: 'The fear of the LORD is the beginning of knowledge, but fools despise wisdom and discipline.' },
  ],
};
const PACK: CheckinPack = packFromSummary(ROW);
const OLD: CheckinPack = packFromSummary({ ...ROW, verses: null, key_verse: null });
const ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';
const MEMBER: MemberContext = { name: '小明', signupId: ID, practices: ['睡前程序 · Wind-down'] };
const KINDS: MessageKind[] = [WELCOME_KIND, 'tue', 'thu', 'weekend'];

const html = (kind: MessageKind = 'thu', pack = PACK, member = MEMBER) => renderCheckin(kind, pack, member).html!;
const hrefs = (doc: string) => [...doc.matchAll(/href="([^"]*)"/g)].map(m => m[1]);
const withoutHrefs = (doc: string) => doc.replace(/href="[^"]*"/g, 'href=""');

describe('renderCheckinHtml: structure and email-client safety', () => {
  it('is one table column ≤ 600px with inline styles, no script, image or <style>, and a preheader', () => {
    for (const kind of KINDS) {
      const doc = html(kind);
      expect(doc.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(doc).toContain(`max-width:${EMAIL_MAX_WIDTH_PX}px`);
      expect(doc).toContain(`font-size:${EMAIL_BODY_PX}px`);
      expect(doc).toContain('role="presentation"');
      expect(doc).not.toMatch(/<script|<img|<style|<link|class="/i);
      expect(doc).toContain(`${EMAIL_BRAND_EN} · ${EMAIL_BRAND_ZH}`);
    }
    expect(html('thu')).toMatch(/<div style="display:none;[^"]*">这周你怎样敬畏神？ · How did you fear God this week\?<\/div>/);
  });

  it('shows no raw URL anywhere outside href attributes', () => {
    for (const kind of KINDS) {
      for (const member of [MEMBER, { name: 'Ann', signupId: null, practices: [] }]) {
        const shown = withoutHrefs(html(kind, PACK, member));
        expect(shown).not.toMatch(/https?:\/\//);
        // the bare host shows exactly once: the footer link's text
        expect(shown.match(/scripturetolife\.org/g)).toEqual(['scripturetolife.org']);
        expect(shown).toContain('>scripturetolife.org</a></td></tr>');
      }
    }
  });

  it('the header wordmark and the footer "scripturetolife.org" link go to the home page', () => {
    const home = `${SITE_ORIGIN}/`;
    for (const kind of KINDS) {
      for (const member of [MEMBER, { name: 'Ann', signupId: null, practices: [] }]) {
        const doc = html(kind, PACK, member);
        expect(doc).toContain(`<a href="${home}" style="color:${EMAIL_COLORS['gold-deep']};text-decoration:none;">${EMAIL_BRAND_EN} · ${EMAIL_BRAND_ZH}</a>`);
        expect(doc).toMatch(new RegExp(`<a href="${home}" style="[^"]*">scripturetolife\\.org</a></td></tr>`));
        expect(hrefs(doc).filter(h => h === home)).toHaveLength(2);
        expect(doc.indexOf(`${EMAIL_BRAND_EN} · ${EMAIL_BRAND_ZH}`)).toBeLessThan(doc.indexOf(' 平安'));   // the header, above the greeting
      }
    }
  });

  it('the text part ends with the site line; SMS does not', () => {
    for (const kind of KINDS) {
      expect(renderCheckin(kind, PACK, MEMBER).text.endsWith(`\n\n${SITE_FOOTER_LINE}`)).toBe(true);
      expect(renderCheckin(kind, PACK, MEMBER, 'sms').text).not.toContain(SITE_FOOTER_LINE);
    }
  });

  it('the gold pill links to the check-in page (welcome: the page itself); the stop link to the stop page', () => {
    const thu = html('thu');
    expect(hrefs(thu)).toContain(checkinPageUrl(ID, 'thu'));
    expect(thu).toContain(`>${escapeHtml(LINK_LABEL.checkin)}</a>`);
    expect(thu).toContain(`href="${stopPageUrl(ID)}"`);
    expect(thu).toContain(`>${escapeHtml(LINK_LABEL.stop)}</a>`);
    const welcome = html(WELCOME_KIND);
    expect(hrefs(welcome)).toContain(checkinPageUrl(ID, null));
    expect(welcome).toContain(`>${escapeHtml(LINK_LABEL.welcome)}</a>`);
    const test = html('thu', PACK, { name: 'Chris', signupId: null, practices: [] });
    expect(hrefs(test)).toContain(packUrl(PACK.id));
    expect(test).not.toContain(escapeHtml(LINK_LABEL.stop));
  });

  it('escapes every interpolated string (names, practices, verses)', () => {
    expect(escapeHtml(`<script>"&'`)).toBe('&lt;script&gt;&quot;&amp;&#39;');
    const evil = { name: '<script>alert(1)</script>', signupId: ID, practices: ['"&<b>'], ownVersion: '<i>own</i>' };
    const doc = html('thu', packFromSummary({ ...ROW, verses: [{ num: 7, cuv: '<敬畏>', en: 'fear & "love"' }] }), evil);
    expect(doc).not.toContain('<script>');
    expect(doc).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(doc).toContain('&quot;&amp;&lt;b&gt;');
    expect(doc).toContain('&lt;i&gt;own&lt;/i&gt;');
    expect(doc).toContain('&lt;敬畏&gt;');
    expect(doc).toContain('fear &amp; &quot;love&quot;');
  });
});

describe('renderCheckinHtml: the passage', () => {
  it('passage label + ref, the key verse in a gold-bordered quote (和合本 first), the whole passage at the end', () => {
    const doc = html('thu');
    const at = (s: string) => doc.indexOf(s);
    expect(at(escapeHtml(PASSAGE_LABEL))).toBeGreaterThan(at('How did you fear God'));
    expect(doc).toContain(`border-left:4px solid ${EMAIL_COLORS.cta}`);
    expect(at('「敬畏耶和华是知识的开端')).toBeLessThan(at('“The fear of the LORD'));
    expect(at('“The fear of the LORD')).toBeLessThan(at(escapeHtml(LINK_LABEL.checkin)));
    expect(at(escapeHtml(LINK_LABEL.checkin))).toBeLessThan(at(FULL_PASSAGE_HEADING));
    expect(at(FULL_PASSAGE_HEADING)).toBeLessThan(at('以色列王大卫儿子所罗门的箴言'));
    expect(at('以色列王大卫儿子所罗门的箴言')).toBeLessThan(at('These are the proverbs'));
    expect(at('These are the proverbs')).toBeLessThan(at(escapeHtml(LINK_LABEL.stop)));
    expect(at('小明 平安')).toBeLessThan(at('Peace, 小明'));
  });

  it('a summary without verses has no passage, key verse or whole-passage section', () => {
    for (const kind of KINDS) {
      const doc = html(kind, OLD);
      expect(doc).not.toContain(escapeHtml(PASSAGE_LABEL));
      expect(doc).not.toContain(FULL_PASSAGE_HEADING);
      expect(doc).not.toContain('border-left:4px');
    }
  });

  it('SMS gets no HTML; Resend gets text + html and keeps the List-Unsubscribe headers', () => {
    expect(renderCheckin('thu', PACK, MEMBER, 'sms').html).toBeUndefined();
    const message = { ...renderCheckin('thu', PACK, MEMBER), oneClickUrl: 'https://x.supabase.co/functions/v1/send-checkins?unsubscribe=1' };
    const body = resendBody({ apiKey: 'k', from: 'f', replyTo: null }, 'a@b.c', message);
    expect(body.text).toBe(message.text);
    expect(body.html).toBe(message.html);
    expect(body.headers).toBeDefined();
  });
});

describe('emailStyle pins', () => {
  const css = readFileSync(path.resolve(__dirname, '../../../../styles/stlTheme.css'), 'utf-8');
  const token = (name: string) => new RegExp(`--stl-${name}:\\s*([^;]+);`).exec(css)?.[1].trim();

  it('every email colour equals its stlTheme.css token; the brand equals the landing wordmark', () => {
    for (const [name, value] of Object.entries(EMAIL_COLORS)) expect(token(name), name).toBe(value);
    expect(EMAIL_BRAND_EN).toBe(BRAND_EN);
    expect(EMAIL_BRAND_ZH).toBe(BRAND_ZH);
    expect(SITE_FOOTER_LINE).toBe(SITE_LINE);   // the text part's site line = the landing's footer line
  });

  it('the email font stacks follow the site stacks in styles/stlShared.css', () => {
    const shared = readFileSync(path.resolve(__dirname, '../../../../styles/stlShared.css'), 'utf-8');
    const font = (name: string) => new RegExp(`--stl-font-${name}:\\s*([^;]+);`).exec(shared)?.[1].trim();
    expect(EMAIL_SCRIPTURE_FONT).toBe(font('scripture'));
    // headings: the site's Chinese heading face first, then the scripture (Song) faces for mail apps without it
    expect(font('zh-head')!.startsWith("'LXGW WenKai'")).toBe(true);
    expect(EMAIL_HEAD_FONT).toBe(`'LXGW WenKai', ${font('scripture')!.replace(", 'STSong'", '')}`);
    // body: the site's CJK sans faces, in the same order (plus mail-client Latin faces)
    const cjk = font('cjk-sans')!.split(',').map(f => f.trim()).filter(f => f !== 'sans-serif' && f !== '-apple-system');
    const body = EMAIL_BODY_FONT.split(',').map(f => f.trim());
    expect(cjk.map(f => body.indexOf(f))).toEqual([...cjk.map(f => body.indexOf(f))].sort((x, y) => x - y));
    expect(cjk.every(f => body.includes(f))).toBe(true);
  });
});
