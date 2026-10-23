/**
 * seoPrerender — delivered metadata, homepage fallback, a real page for every
 * bundled public pack, sitemap and robots; for the deployed base "/" and the
 * default "/bible/" (2026-10 review: empty root, brand-only titles, no
 * description / canonical / OG / Twitter, robots and sitemap 404).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import {
  loadPublicPacks, studyPageHtml, studyTitle, studyDescription, sitemapXml, robotsTxt, transformIndexHtml,
  homeFallbackHtml, normalizeBase, normalizeOrigin, validatePublicPack, escapeHtml, splitHeading, SeoSite, PublicPack,
} from '../seo/prerender';
import { drawOgPixels, OG_IMAGE_TAGLINE, OG_IMAGE_ALT, OG_IMAGE_WIDTH, GOLD_PALE } from '../seo/ogImage';
import { SAMPLE_PACK_ID } from '../../components/landing/landingRoute';
import { HERO_SUB_EN, HERO_EYEBROW, GROUP_CTA, PERSONAL_CTA, NEW_STUDY_SIGNIN_NOTE } from '../../components/landing/landingStrings';

const ROOT = path.resolve(__dirname, '../..');
const PACKS_DIR = path.join(ROOT, 'public/packs');
const packs = loadPublicPacks(PACKS_DIR);
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const viteConfig = fs.readFileSync(path.join(ROOT, 'vite.config.ts'), 'utf8');

const SITES: SeoSite[] = [
  { origin: 'https://scripturetolife.org', base: '/' },
  { origin: 'https://scripturetolife.org', base: '/bible/' },
];

const doc = (html: string) => new JSDOM(html).window.document;
const meta = (d: Document, sel: string) => d.querySelector(sel)?.getAttribute('content') ?? d.querySelector(sel)?.getAttribute('href');

/** WCAG 2.x contrast ratio between two computed `rgb(...)` / `#rrggbb` colors. */
function contrastRatio(a: string, b: string): number {
  const channels = (c: string) => {
    const hex = c.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    const parts = hex ? hex.slice(1).map(h => parseInt(h, 16)) : (c.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map(Number);
    if (parts.length !== 3) throw new Error(`unparseable color: ${c}`);
    return parts;
  };
  const luminance = (c: string) => {
    const [r, g, bl] = channels(c).map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('public packs', () => {
  it('finds every committed public pack (and the featured sample is one of them)', () => {
    const files = fs.readdirSync(PACKS_DIR).filter(f => f.endsWith('.json'));
    expect(packs.map(p => `${p.id}.json`).sort()).toEqual(files.sort());
    expect(packs.some(p => p.id === SAMPLE_PACK_ID)).toBe(true);
  });

  it('the vite config features the landing sample pack', () => {
    expect(viteConfig).toContain(`FEATURED_PACK_ID = "${SAMPLE_PACK_ID}"`);
    expect(viteConfig).toContain('seoPrerender({ featuredPackId: FEATURED_PACK_ID })');
  });

  it('an invalid pack fails loudly instead of becoming an empty page', () => {
    expect(() => validatePublicPack({ id: 'x', title: 't', passageRef: 'r', sections: [] }, '/p/x.json')).toThrow(/no sections/);
    expect(() => validatePublicPack({ id: 'y', title: 't', passageRef: 'r', sections: [{ kind: 'a', heading: 'h' }] }, '/p/x.json'))
      .toThrow(/does not match/);
    expect(() => validatePublicPack({ id: 'x', passageRef: 'r', sections: [{ kind: 'a', heading: 'h' }] }, '/p/x.json')).toThrow(/title/);
  });
});

describe('URLs', () => {
  it('normalizes base and origin', () => {
    expect(normalizeBase(undefined)).toBe('/');
    expect(normalizeBase('bible')).toBe('/bible/');
    expect(normalizeBase('/bible/')).toBe('/bible/');
    expect(normalizeOrigin('https://example.org/')).toBe('https://example.org');
    expect(normalizeOrigin(undefined)).toBe('https://scripturetolife.org');
  });
});

describe.each(SITES)('study pages (base $base)', (site) => {
  it.each(packs.map(p => [p.id, p] as [string, PublicPack]))('%s: a real bilingual page, not a shell', (_id, pack) => {
    const d = doc(studyPageHtml(site, pack));
    const canonical = `${site.origin}${site.base}studies/${pack.id}/`;
    expect(d.documentElement.lang).toBe('zh-Hans');
    expect(d.title).toBe(studyTitle(pack));
    expect(d.title).toContain(pack.title);
    expect(meta(d, 'meta[name="description"]')).toBe(studyDescription(pack));
    expect(meta(d, 'link[rel="canonical"]')).toBe(canonical);
    expect(meta(d, 'meta[property="og:url"]')).toBe(canonical);
    expect(meta(d, 'meta[property="og:type"]')).toBe('article');
    expect(meta(d, 'meta[property="og:image"]')).toBe(`${site.origin}${site.base}og-image.png`);
    expect(meta(d, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(d.querySelector('h1')!.textContent).toContain(splitHeading(pack.title).zh);

    // The pack's actual content: every verse in both languages, every question.
    const verses = pack.sections.flatMap(s => s.verses ?? []);
    const rows = d.querySelectorAll('table.verses tbody tr');
    expect(rows.length).toBe(verses.length);
    for (const v of verses) {
      expect(d.body.textContent).toContain(v.cuv);
      expect(d.body.textContent).toContain(v.en);
    }
    const questions = pack.sections.flatMap(s => s.questions ?? []);
    expect(d.querySelectorAll('ol > li').length).toBe(questions.length);
    expect((d.body.textContent ?? '').length).toBeGreaterThan(2000);

    // Mixed content is language-tagged.
    expect(d.querySelectorAll('[lang="en"]').length).toBeGreaterThan(20);
    expect(d.querySelectorAll('td[lang="zh-Hans"]').length).toBe(verses.length);

    // Interactive presentation stays on the hash route, under the right base.
    const open = d.querySelector('[data-testid="open-presentation"]')!;
    expect(open.getAttribute('href')).toBe(`${site.base}#/pack/${pack.id}`);
    // Keyboard: skip link → focusable main.
    expect(d.querySelector('a.stl-skip-link')!.getAttribute('href')).toBe('#main-content');
    expect(d.getElementById('main-content')!.getAttribute('tabindex')).toBe('-1');
  });

  it('the primary CTA meets WCAG AA contrast, including its bilingual children', () => {
    // 2026-10 QA: white on #c8952e measured 2.69:1, and the page-wide [lang="en"] rule recolored the English half.
    const dom = new JSDOM(studyPageHtml(site, packs[0]));
    const open = dom.window.document.querySelector('[data-testid="open-presentation"]')!;
    const style = dom.window.getComputedStyle(open);
    const fg = style.color;
    expect(contrastRatio(fg, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    const children = open.querySelectorAll('[lang]');
    expect(children.length).toBe(2);
    for (const child of children) expect(dom.window.getComputedStyle(child).color).toBe(fg);
  });

  it('every study page has a unique title and description', () => {
    expect(new Set(packs.map(studyTitle)).size).toBe(packs.length);
    expect(new Set(packs.map(studyDescription)).size).toBe(packs.length);
  });

  it('sitemap lists the homepage and every study page; robots points at it', () => {
    const xml = sitemapXml(site, packs);
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(locs).toEqual([
      `${site.origin}${site.base}`,
      ...packs.map(p => `${site.origin}${site.base}studies/${p.id}/`),
    ]);
    expect(new JSDOM(xml, { contentType: 'text/xml' }).window.document.querySelector('parsererror')).toBeNull();
    expect(robotsTxt(site)).toContain(`Sitemap: ${site.origin}${site.base}sitemap.xml`);
    expect(robotsTxt(site)).toMatch(/User-agent: \*\nAllow: \//);
  });
});

describe.each(SITES)('delivered index.html (base $base)', (site) => {
  const html = transformIndexHtml(indexHtml, site, packs, SAMPLE_PACK_ID);
  const d = doc(html);

  it('has description, canonical, Open Graph and Twitter metadata', () => {
    expect(d.title).toMatch(/Scripture to Life/);
    expect(d.title).not.toBe('活出神的话 · Scripture to Life');
    expect(meta(d, 'meta[name="description"]')).toContain(HERO_SUB_EN);
    expect(meta(d, 'link[rel="canonical"]')).toBe(`${site.origin}${site.base}`);
    expect(meta(d, 'meta[property="og:title"]')).toBe(d.title);
    expect(meta(d, 'meta[property="og:image"]')).toBe(`${site.origin}${site.base}og-image.png`);
    expect(meta(d, 'meta[property="og:image:width"]')).toBe('1200');
    expect(meta(d, 'meta[property="og:image:height"]')).toBe('630');
    expect(meta(d, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    expect(meta(d, 'meta[name="twitter:image"]')).toBe(`${site.origin}${site.base}og-image.png`);
    expect(d.querySelectorAll('title').length).toBe(1);
    expect(d.documentElement.lang).toBe('zh-Hans');
  });

  it('the root carries a meaningful homepage, with links that keep hash routes working', () => {
    const root = d.getElementById('root')!;
    const h1 = root.querySelector('h1')!.textContent!;
    expect(h1).toContain('Group Bible study');
    // R3: the fallback <h1> and the <title> render the app's hero eyebrow, not a copy of it.
    expect(h1).toBe(HERO_EYEBROW.replace(' · ', ' '));
    expect(d.title).toContain(HERO_EYEBROW);
    expect(h1).not.toMatch(/bilingual/i);
    expect(h1).not.toContain('双语');
    expect(root.textContent).toContain(HERO_SUB_EN);
    const hrefs = [...root.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(hrefs).toContain(`${site.base}#/pack/${SAMPLE_PACK_ID}`);
    expect(hrefs).toContain(`${site.base}#app`);
    expect(hrefs).toContain(`${site.base}#/new`);
    for (const p of packs) expect(hrefs).toContain(`${site.base}studies/${p.id}/`);
    expect(root.textContent).toContain(GROUP_CTA.split(' ').slice(1).join(' '));
    expect(root.textContent).toContain(PERSONAL_CTA.split(' ').slice(1).join(' '));
    expect(root.textContent).toContain(NEW_STUDY_SIGNIN_NOTE.split(' · ')[1]);
    expect(root.textContent).not.toMatch(/无需登录|No sign-in needed|Google sign-in required|Requires Google sign-in/);   // owner 2026-10-23: Google or email, no "no sign-in" line
    expect(root.querySelector('a.stl-skip-link')).not.toBeNull();
    expect(root.querySelector('main#main-content[tabindex="-1"]')).not.toBeNull();
  });

  it('a hash route hides the fallback until the app mounts; no-JS visitors can scroll', () => {
    expect(html).toContain("document.documentElement.classList.add('stl-app-route')");
    expect(html).toContain('.stl-app-route .stl-fallback { display: none; }');
    expect(html).toMatch(/<noscript><style>body \{ overflow: auto !important; \}<\/style><\/noscript>/);
  });

  it('still loads the app module', () => {
    expect(d.querySelector('script[type="module"][src="/index.tsx"]')).not.toBeNull();
  });
});

describe('helpers', () => {
  it('escapes HTML in pack text', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('pack text is escaped in pages', () => {
    const evil = validatePublicPack({
      id: 'evil', title: '恶 <script>alert(1)</script>', passageRef: 'x · y',
      sections: [{ kind: 'context', heading: '背景 Context', body: ['<img src=x onerror=1> · <b>'] }],
    }, '/p/evil.json');
    const html = studyPageHtml(SITES[0], evil);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
  });

  it('the fallback without packs still renders the hero', () => {
    expect(homeFallbackHtml(SITES[1], [], SAMPLE_PACK_ID)).toContain('/bible/#app');
  });

  it('refuses an index.html without the empty root (would otherwise ship no fallback)', () => {
    expect(() => transformIndexHtml('<title>x</title><div id="root">x</div>', SITES[0], packs, SAMPLE_PACK_ID)).toThrow(/root/);
  });
});

describe('social card tagline', () => {
  // Tagline row: drawn at x=84, y=320, scale 5 (35px tall, 30px per glyph).
  const paleXs = (px: Uint8Array) => {
    const xs: number[] = [];
    for (let y = 320; y < 355; y++) for (let x = 0; x < OG_IMAGE_WIDTH; x++) {
      const o = (y * OG_IMAGE_WIDTH + x) * 3;
      if (px[o] === GOLD_PALE[0] && px[o + 1] === GOLD_PALE[1] && px[o + 2] === GOLD_PALE[2]) xs.push(x);
    }
    return xs;
  };

  it('the renderer draws GROUP BIBLE STUDY, not the old bilingual tagline', () => {
    expect(OG_IMAGE_TAGLINE).toBe('GROUP BIBLE STUDY');
    expect(OG_IMAGE_ALT).not.toMatch(/bilingual/i);
    const card = drawOgPixels();
    expect(Buffer.from(card).equals(Buffer.from(drawOgPixels('GROUP BIBLE STUDY')))).toBe(true);
    expect(Buffer.from(card).equals(Buffer.from(drawOgPixels('BILINGUAL GROUP BIBLE STUDY')))).toBe(false);
    const xs = paleXs(card);
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(84);
    expect(Math.max(...xs)).toBeLessThan(84 + OG_IMAGE_TAGLINE.length * 30);
  });
});
