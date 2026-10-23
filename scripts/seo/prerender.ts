/**
 * prerender.ts — the HTML crawlers and no-JS visitors get · 预渲染
 *
 * The app is a client-rendered SPA with hash routes, so the delivered
 * index.html used to be an empty root with a brand-only title (2026-10
 * review). These pure builders produce, from the same strings and pack
 * JSON the app uses:
 *   - the homepage <head> metadata (description, canonical, Open Graph,
 *     Twitter card, social image) and a meaningful fallback body that the
 *     app replaces when it mounts (index.tsx clears #root first);
 *   - one real page per bundled public pack at <base>studies/<id>/ with its
 *     actual bilingual content (Scripture, context, questions, life menu…)
 *     and a link into the interactive presentation (<base>#/pack/<id>);
 *   - sitemap.xml and robots.txt.
 * Every URL is built from the site origin + Vite base path, so the default
 * /bible/ build and the deployed VITE_BASE_PATH=/ build are both correct.
 * scripts/seo/viteSeo.ts wires these into `vite build` and the dev server.
 * TODO(R4): over the 300-line budget; split on the section markers below into
 * text helpers, <head> meta, homepage fallback, study pages, sitemap/robots.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  BRAND_EN, BRAND_ZH, HERO_SUB_ZH, HERO_SUB_EN, HERO_SOURCE_NOTE, GROUP_CTA, SAMPLE_NO_SIGNIN,
  PERSONAL_CTA, NEW_STUDY_LINE, NEW_STUDY_SIGNIN_NOTE, AI_SIGNIN_NOTE, HERO_EYEBROW,
} from '../../components/landing/landingStrings';
import { OG_IMAGE_FILE, OG_IMAGE_WIDTH, OG_IMAGE_HEIGHT, OG_IMAGE_ALT } from './ogImage';

export const DEFAULT_SITE_ORIGIN = 'https://scripturetolife.org';
export const STUDIES_DIR = 'studies';
export const SKIP_LABEL = '跳到主要内容 · Skip to main content';

export const HOME_TITLE = `${BRAND_ZH} · ${BRAND_EN} — ${HERO_EYEBROW}`;
export const HOME_DESCRIPTION = `${HERO_SUB_EN} ${HERO_SUB_ZH}`;

export interface SeoSite {
  /** "https://scripturetolife.org" — no trailing slash. */
  origin: string;
  /** Vite base: "/" or "/bible/" — always starts and ends with "/". */
  base: string;
}

/* ---------- minimal pack shape (public/packs/<id>.json, components/studypack/packTypes) ---------- */

export interface PublicPackVerse { num: number; cuv: string; en: string }
export interface PublicPackSection {
  kind: string;
  heading: string;
  body?: string[];
  verses?: PublicPackVerse[];
  keyPhrase?: string;
  questions?: string[];
  rows?: { area: string; practice: string }[];
}
export interface PublicPack {
  id: string;
  title: string;
  date?: string;
  passageRef: string;
  enVersion?: string;
  leaderId?: string;
  sections: PublicPackSection[];
}

const PACK_ID_RE = /^[A-Za-z0-9._-]+$/;

/** Throws with the file name when a committed pack cannot become a page (the build must not ship an empty shell). */
export function validatePublicPack(raw: unknown, file: string): PublicPack {
  const p = raw as Partial<PublicPack> | null;
  const fail = (why: string): never => { throw new Error(`public pack ${file}: ${why}`); };
  if (!p || typeof p !== 'object') fail('not an object');
  if (typeof p!.id !== 'string' || !PACK_ID_RE.test(p!.id)) fail('bad id');
  if (`${p!.id}.json` !== path.basename(file)) fail(`id "${p!.id}" does not match the file name`);
  if (typeof p!.title !== 'string' || !p!.title.trim()) fail('missing title');
  if (typeof p!.passageRef !== 'string' || !p!.passageRef.trim()) fail('missing passageRef');
  if (!Array.isArray(p!.sections) || p!.sections.length === 0) fail('no sections');
  for (const s of p!.sections!) {
    if (!s || typeof s.kind !== 'string' || typeof s.heading !== 'string') fail('section without kind/heading');
  }
  return p as PublicPack;
}

/** Every committed public pack (public/packs/*.json), sorted by id. */
export function loadPublicPacks(packsDir: string): PublicPack[] {
  if (!fs.existsSync(packsDir)) return [];
  return fs.readdirSync(packsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      const file = path.join(packsDir, f);
      return validatePublicPack(JSON.parse(fs.readFileSync(file, 'utf8')), file);
    });
}

/* ---------- URLs ---------- */

export function normalizeBase(base: string | undefined): string {
  let b = (base || '/').trim();
  if (!b.startsWith('/')) b = `/${b}`;
  if (!b.endsWith('/')) b = `${b}/`;
  return b;
}

export function normalizeOrigin(origin: string | undefined): string {
  return (origin || DEFAULT_SITE_ORIGIN).replace(/\/+$/, '');
}

export const homePath = (site: SeoSite) => site.base;
export const studyPath = (site: SeoSite, id: string) => `${site.base}${STUDIES_DIR}/${encodeURIComponent(id)}/`;
export const packAppPath = (site: SeoSite, id: string) => `${site.base}#/pack/${encodeURIComponent(id)}`;
export const absolute = (site: SeoSite, p: string) => `${site.origin}${p}`;
export const ogImageUrl = (site: SeoSite) => absolute(site, `${site.base}${OG_IMAGE_FILE}`);

/* ---------- text helpers ---------- */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "中文 · English" → halves (no separator → all Chinese). */
export function splitLine(line: string): { zh: string; en: string } {
  const at = line.indexOf(' · ');
  return at < 0 ? { zh: line, en: '' } : { zh: line.slice(0, at), en: line.slice(at + 3) };
}

/** "中文 English words" heading → halves at the first space after the CJK run. */
export function splitHeading(heading: string): { zh: string; en: string } {
  const m = /^([^A-Za-z]*?)\s+([A-Za-z].*)$/.exec(heading);
  return m ? { zh: m[1], en: m[2] } : { zh: heading, en: '' };
}

/** A bilingual line as two language-tagged spans. */
function bilingualHtml(line: string, tag = 'span'): string {
  const { zh, en } = splitLine(line);
  const zhHtml = zh ? `<${tag} lang="zh-Hans">${escapeHtml(zh)}</${tag}>` : '';
  const enHtml = en ? `<${tag} lang="en">${escapeHtml(en)}</${tag}>` : '';
  return zhHtml && enHtml ? `${zhHtml} <span aria-hidden="true">·</span> ${enHtml}` : zhHtml || enHtml;
}

function headingHtml(heading: string): string {
  const { zh, en } = splitHeading(heading);
  return en
    ? `<span lang="zh-Hans">${escapeHtml(zh)}</span> <span lang="en">${escapeHtml(en)}</span>`
    : `<span lang="zh-Hans">${escapeHtml(zh)}</span>`;
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:·—–\s]+$/, '')}…`;
}

/* ---------- <head> ---------- */

export interface HeadMeta {
  title: string;
  description: string;
  canonical: string;
  ogType: 'website' | 'article';
  image: string;
  imageAlt: string;
  locale?: string;
}

export function headMetaHtml(m: HeadMeta): string {
  const e = escapeHtml;
  return [
    `<meta name="description" content="${e(m.description)}">`,
    `<link rel="canonical" href="${e(m.canonical)}">`,
    `<meta property="og:type" content="${m.ogType}">`,
    `<meta property="og:site_name" content="${e(`${BRAND_ZH} · ${BRAND_EN}`)}">`,
    `<meta property="og:title" content="${e(m.title)}">`,
    `<meta property="og:description" content="${e(m.description)}">`,
    `<meta property="og:url" content="${e(m.canonical)}">`,
    `<meta property="og:locale" content="${m.locale ?? 'zh_CN'}">`,
    `<meta property="og:locale:alternate" content="en_US">`,
    `<meta property="og:image" content="${e(m.image)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="${OG_IMAGE_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_IMAGE_HEIGHT}">`,
    `<meta property="og:image:alt" content="${e(m.imageAlt)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${e(m.title)}">`,
    `<meta name="twitter:description" content="${e(m.description)}">`,
    `<meta name="twitter:image" content="${e(m.image)}">`,
    `<meta name="twitter:image:alt" content="${e(m.imageAlt)}">`,
  ].join('\n    ');
}

export function homeHeadMeta(site: SeoSite): HeadMeta {
  return {
    title: HOME_TITLE,
    description: truncate(HOME_DESCRIPTION, 300),
    canonical: absolute(site, homePath(site)),
    ogType: 'website',
    image: ogImageUrl(site),
    imageAlt: OG_IMAGE_ALT,
  };
}

/* ---------- homepage fallback body ---------- */

const FALLBACK_ID = 'stl-fallback';

/** Static homepage content inside #root. React replaces it on mount (index.tsx clears #root). */
export function homeFallbackHtml(site: SeoSite, packs: PublicPack[], featuredId: string): string {
  const featured = packs.find(p => p.id === featuredId) ?? packs[0];
  const [eyebrow, sample, signin] = [HERO_EYEBROW, SAMPLE_NO_SIGNIN, NEW_STUDY_SIGNIN_NOTE].map(splitLine);
  const cta = (label: string) => {
    const at = label.indexOf(' ');
    return `<span lang="zh-Hans">${escapeHtml(label.slice(0, at))}</span> <span lang="en">${escapeHtml(label.slice(at + 1))}</span>`;
  };
  const studies = packs.map(p => `
          <li><a href="${escapeHtml(studyPath(site, p.id))}">${headingHtml(p.title)}</a>
            <span class="stl-fb-ref">${bilingualHtml(p.passageRef)}</span></li>`).join('');
  return `<div id="${FALLBACK_ID}" class="stl-fallback" lang="zh-Hans">
      <a class="stl-skip-link" href="#main-content">${escapeHtml(SKIP_LABEL)}</a>
      <main id="main-content" tabindex="-1">
        <header>
          <p class="stl-fb-brand"><span lang="zh-Hans">${escapeHtml(BRAND_ZH)}</span> · <span lang="en">${escapeHtml(BRAND_EN)}</span></p>
          <h1><span lang="zh-Hans">${escapeHtml(eyebrow.zh)}</span> <span lang="en">${escapeHtml(eyebrow.en)}</span></h1>
          <p>${escapeHtml(HERO_SUB_ZH)}</p>
          <p lang="en">${escapeHtml(HERO_SUB_EN)}</p>
          <p class="stl-fb-note">${escapeHtml(HERO_SOURCE_NOTE.zh)} <span lang="en">${escapeHtml(HERO_SOURCE_NOTE.en)}</span></p>
        </header>
        <nav aria-label="开始 Get started">
          <ul>
            ${featured ? `<li><a href="${escapeHtml(packAppPath(site, featured.id))}">${cta(GROUP_CTA)}</a>
              — ${escapeHtml(sample.zh)} · <span lang="en">${escapeHtml(sample.en)}</span>
              (<a href="${escapeHtml(studyPath(site, featured.id))}"><span lang="zh-Hans">阅读全文</span> <span lang="en">read it as a page</span></a>)</li>` : ''}
            <li><a href="${escapeHtml(`${site.base}#app`)}">${cta(PERSONAL_CTA)}</a></li>
            <li><a href="${escapeHtml(`${site.base}#/new`)}">${cta(NEW_STUDY_LINE)}</a>
              — ${escapeHtml(signin.zh)} · <span lang="en">${escapeHtml(signin.en)}</span></li>
          </ul>
          <p class="stl-fb-note">${bilingualHtml(AI_SIGNIN_NOTE)}</p>
        </nav>
        ${packs.length ? `<section aria-labelledby="stl-fb-studies">
          <h2 id="stl-fb-studies"><span lang="zh-Hans">公开的查经</span> <span lang="en">Public studies</span></h2>
          <ul>${studies}
          </ul>
        </section>` : ''}
      </main>
    </div>`;
}

/* ---------- study pages ---------- */

const SKIP_KINDS = new Set(['qr', 'title']);

function sectionHtml(s: PublicPackSection, enVersion: string): string {
  const parts: string[] = [`<h2>${headingHtml(s.heading)}</h2>`];
  if (s.keyPhrase) parts.push(`<p class="key">${bilingualKeyPhrase(s.keyPhrase)}</p>`);
  if (s.verses?.length) {
    parts.push(`<table class="verses">
        <caption class="sr"><span lang="zh-Hans">经文</span> <span lang="en">Scripture</span></caption>
        <thead><tr><th scope="col">#</th><th scope="col" lang="zh-Hans">和合本 CUV</th><th scope="col" lang="en">${escapeHtml(enVersion)}</th></tr></thead>
        <tbody>${s.verses.map(v => `
          <tr><th scope="row">${v.num}</th><td lang="zh-Hans">${escapeHtml(v.cuv)}</td><td lang="en">${escapeHtml(v.en)}</td></tr>`).join('')}
        </tbody>
      </table>`);
  }
  if (s.body?.length) parts.push(`<ul>${s.body.map(l => `<li>${bilingualHtml(l)}</li>`).join('')}</ul>`);
  if (s.questions?.length) parts.push(`<ol>${s.questions.map(q => `<li>${bilingualHtml(q)}</li>`).join('')}</ol>`);
  if (s.rows?.length) {
    parts.push(`<table class="menu"><tbody>${s.rows.map(r => `
          <tr><th scope="row">${headingHtml(r.area)}</th><td>${bilingualHtml(r.practice)}</td></tr>`).join('')}
        </tbody></table>`);
  }
  return `<section>${parts.join('\n      ')}</section>`;
}

/** 「中文」 “English” (v.25) → language-tagged halves. */
function bilingualKeyPhrase(phrase: string): string {
  const at = phrase.search(/[“"A-Za-z]/);
  if (at <= 0) return escapeHtml(phrase);
  return `<span lang="zh-Hans">${escapeHtml(phrase.slice(0, at).trim())}</span> <span lang="en">${escapeHtml(phrase.slice(at))}</span>`;
}

/** Unique per pack: title + passage + the pack's own first context line. */
export function studyDescription(pack: PublicPack): string {
  const ref = splitLine(pack.passageRef);
  const context = pack.sections.find(s => s.kind === 'context')?.body ?? [];
  const firstEn = context.map(l => splitLine(l).en).find(Boolean) ?? '';
  const questions = pack.sections.find(s => s.kind === 'discussion')?.questions?.length ?? 0;
  const head = `${splitHeading(pack.title).en || pack.title} — a bilingual (Chinese/English) group Bible study on ${ref.en || ref.zh}`;
  const tail = questions ? ` with ${questions} discussion questions.` : '.';
  return truncate(`${head}${tail} ${firstEn} ${ref.zh}双语查经。`, 300);
}

export function studyTitle(pack: PublicPack): string {
  return `${pack.title} · ${BRAND_ZH} ${BRAND_EN}`;
}

export function studyPageHtml(site: SeoSite, pack: PublicPack): string {
  const canonical = absolute(site, studyPath(site, pack.id));
  const meta = headMetaHtml({
    title: studyTitle(pack),
    description: studyDescription(pack),
    canonical,
    ogType: 'article',
    image: ogImageUrl(site),
    imageAlt: OG_IMAGE_ALT,
  });
  const enVersion = pack.enVersion || 'BSB';
  const body = pack.sections.filter(s => !SKIP_KINDS.has(s.kind)).map(s => sectionHtml(s, enVersion)).join('\n    ');
  const appLink = packAppPath(site, pack.id);
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    name: pack.title,
    description: studyDescription(pack),
    inLanguage: ['zh-Hans', 'en'],
    url: canonical,
    learningResourceType: 'Bible study guide',
    isAccessibleForFree: true,
  }).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="zh-Hans">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(studyTitle(pack))}</title>
    ${meta}
    <link rel="icon" type="image/svg+xml" href="${site.base}favicon.svg?v=4">
    <link rel="icon" type="image/png" sizes="32x32" href="${site.base}favicon-32.png?v=4">
    <script type="application/ld+json">${jsonLd}</script>
    <style>
      body { margin: 0; font: 18px/1.65 'Inter', system-ui, -apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif; background: #f8f4ec; color: #2a241c; }
      main, header.top, footer { max-width: 60rem; margin: 0 auto; padding: 0 1.25rem; }
      header.top { padding-top: 1.25rem; }
      header.top a { color: #6b4e16; }
      h1 { font-size: 2rem; line-height: 1.25; margin: 1rem 0 0.25rem; }
      h2 { font-size: 1.35rem; margin: 2.25rem 0 0.5rem; border-bottom: 2px solid #e4d3ad; padding-bottom: 0.25rem; }
      [lang="en"] { color: #4a4236; }
      .ref { font-size: 1.1rem; }
      .cta { display: inline-block; margin: 1rem 0; padding: 0.75rem 1.25rem; border-radius: 999px; background: #c8952e; color: #2a241c; font-weight: 600; text-decoration: none; }
      .cta [lang] { color: #2a241c; }
      .cta:focus-visible, a:focus-visible { outline: 3px solid #6b4e16; outline-offset: 3px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { text-align: left; vertical-align: top; padding: 0.5rem; border-top: 1px solid #e9dfca; }
      .verses td[lang="en"] { font-style: italic; }
      .key { font-weight: 600; }
      .note { font-size: 0.95rem; color: #5c5345; }
      .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .stl-skip-link { position: absolute; left: 8px; top: -100px; padding: 12px 18px; background: #1f2937; color: #fff; border-radius: 8px; }
      .stl-skip-link:focus { top: 8px; }
      footer { padding-bottom: 3rem; margin-top: 3rem; font-size: 0.9rem; }
    </style>
</head>
<body>
  <a class="stl-skip-link" href="#main-content">${escapeHtml(SKIP_LABEL)}</a>
  <header class="top">
    <a href="${escapeHtml(homePath(site))}"><span lang="zh-Hans">${escapeHtml(BRAND_ZH)}</span> · <span lang="en">${escapeHtml(BRAND_EN)}</span></a>
  </header>
  <main id="main-content" tabindex="-1">
    <article>
    <h1>${headingHtml(pack.title)}</h1>
    <p class="ref">${bilingualHtml(pack.passageRef)}</p>
    <p><a class="cta" href="${escapeHtml(appLink)}" data-testid="open-presentation"><span lang="zh-Hans">打开互动演示</span> <span lang="en">Open the interactive presentation</span></a></p>
    <p class="note">${escapeHtml(HERO_SOURCE_NOTE.zh)} <span lang="en">${escapeHtml(HERO_SOURCE_NOTE.en)}</span></p>
    ${body}
    </article>
  </main>
  <footer>
    <p><a href="${escapeHtml(homePath(site))}"><span lang="zh-Hans">返回首页</span> <span lang="en">Home</span></a>
      · <a href="${escapeHtml(appLink)}"><span lang="zh-Hans">互动演示</span> <span lang="en">Presentation</span></a></p>
  </footer>
</body>
</html>
`;
}

/* ---------- sitemap / robots ---------- */

export function sitemapXml(site: SeoSite, packs: PublicPack[]): string {
  const urls = [absolute(site, homePath(site)), ...packs.map(p => absolute(site, studyPath(site, p.id)))];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${escapeHtml(u)}</loc></url>`).join('\n')}
</urlset>
`;
}

/**
 * robots.txt for the build output. Crawlers only read it at the host root:
 * with VITE_BASE_PATH=/ (the deployment) dist/robots.txt is that file; under
 * a sub-path base the host's own root robots.txt must point at this sitemap.
 */
export function robotsTxt(site: SeoSite): string {
  return `User-agent: *
Allow: /

Sitemap: ${absolute(site, `${site.base}sitemap.xml`)}
`;
}

/* ---------- index.html transform ---------- */

export const ROUTE_GUARD_SCRIPT =
  // A hash route (#app, #/pack/…) is not the homepage: hide the fallback until the app mounts.
  `<script>(function(){var h=location.hash;if(h&&h!=='#')document.documentElement.classList.add('stl-app-route');})();</script>`;

export const FALLBACK_STYLE = `<style>
      .stl-app-route .stl-fallback { display: none; }
      .stl-fallback { max-width: 52rem; margin: 0 auto; padding: 2rem 1.25rem; font-size: 18px; line-height: 1.65; color: #2a241c; }
      .stl-fallback h1 { font-size: 2rem; line-height: 1.25; }
      .stl-fallback a { color: #6b4e16; }
      .stl-fb-note { color: #5c5345; font-size: 0.95rem; }
    </style>
    <noscript><style>body { overflow: auto !important; }</style></noscript>`;

/** Insert the homepage metadata into <head> and the fallback into the empty #root. */
export function transformIndexHtml(html: string, site: SeoSite, packs: PublicPack[], featuredId: string): string {
  const meta = homeHeadMeta(site);
  if (!html.includes('<div id="root"></div>')) throw new Error('index.html: empty <div id="root"></div> not found');
  if (!/<title>[^<]*<\/title>/.test(html)) throw new Error('index.html: <title> not found');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>\n    ${headMetaHtml(meta)}\n    ${ROUTE_GUARD_SCRIPT}\n    ${FALLBACK_STYLE}`)
    .replace('<div id="root"></div>', `<div id="root">${homeFallbackHtml(site, packs, featuredId)}</div>`);
}
