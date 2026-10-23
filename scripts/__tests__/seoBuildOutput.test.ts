/**
 * seoBuildOutput — the real `vite build` output, for the deployment's
 * VITE_BASE_PATH=/ and the default /bible/ base: delivered homepage metadata
 * and fallback, one prerendered page per public pack, sitemap, robots and the
 * social image. Runs vite in a child process (a clean Node, as `npm run build`
 * does) into a scratch directory under node_modules/.cache. The same builds
 * also pin the OpenCC split (one dictionary chunk per direction).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { SAMPLE_PACK_ID } from '../../components/landing/landingRoute';

const ROOT = path.resolve(__dirname, '../..');
const VITE = path.join(ROOT, 'node_modules/vite/bin/vite.js');
const SCRATCH = path.join(ROOT, 'node_modules/.cache/stl-seo-build');
const PACK_IDS = fs.readdirSync(path.join(ROOT, 'public/packs')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));

function build(name: string, env: Record<string, string | undefined>): string {
  const outDir = path.join(SCRATCH, name);
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...env, NODE_ENV: 'production' };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete childEnv[k];
  const result = spawnSync(process.execPath, [VITE, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: ROOT, env: childEnv, encoding: 'utf8', timeout: 240_000,
  });
  if (result.status !== 0) throw new Error(`vite build (${name}) failed:\n${result.stderr}\n${result.stdout}`);
  return outDir;
}

const read = (dir: string, file: string) => fs.readFileSync(path.join(dir, file), 'utf8');

// One phrase from each OpenCC table, in that table's own order (traditional→simplified, simplified→traditional).
const T2CN_MARKER = '藉此機會 借此机会';
const CN2T_MARKER = '借此机会 藉此機會';
/** The 繁→简 table is ~62 KB minified; the full bundle with both tables was 1.1 MB. */
const T2CN_CHUNK_MAX_CHARS = 150_000;

describe.each([
  { name: 'root', env: { VITE_BASE_PATH: '/' }, base: '/' },
  { name: 'default', env: { VITE_BASE_PATH: undefined }, base: '/bible/' },
])('vite build output — $name base ($base)', ({ name, env, base }) => {
  let dist = '';
  beforeAll(() => { dist = build(name, env); }, 240_000);

  it('index.html: metadata in the delivered head and a non-empty root', () => {
    const d = new JSDOM(read(dist, 'index.html')).window.document;
    expect(d.querySelector('meta[name="description"]')?.getAttribute('content')).toBeTruthy();
    expect(d.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://scripturetolife.org${base}`);
    expect(d.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`https://scripturetolife.org${base}og-image.png`);
    expect(d.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
    expect(d.getElementById('root')!.textContent!.trim().length).toBeGreaterThan(200);
    expect(d.querySelector(`#root a[href="${base}#/pack/${SAMPLE_PACK_ID}"]`)).not.toBeNull();
    // The built app bundle is still referenced under the base.
    const script = d.querySelector('script[type="module"][src]')!.getAttribute('src')!;
    expect(script.startsWith(`${base}assets/`)).toBe(true);
    expect(fs.existsSync(path.join(dist, script.slice(base.length)))).toBe(true);
  });

  it('a real page at studies/<id>/ for EVERY public pack', () => {
    expect(PACK_IDS.length).toBeGreaterThan(0);
    const titles = new Set<string>();
    for (const id of PACK_IDS) {
      const file = path.join(dist, 'studies', id, 'index.html');
      expect(fs.existsSync(file), id).toBe(true);
      const d = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;
      titles.add(d.title);
      expect(d.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(`https://scripturetolife.org${base}studies/${id}/`);
      expect(d.querySelector('[data-testid="open-presentation"]')!.getAttribute('href')).toBe(`${base}#/pack/${id}`);
      expect(d.querySelectorAll('table.verses tbody tr').length).toBeGreaterThan(0);
      expect(d.body.textContent!.length).toBeGreaterThan(2000);
    }
    expect(titles.size).toBe(PACK_IDS.length);
  });

  it('sitemap.xml, robots.txt and og-image.png', () => {
    const sitemap = read(dist, 'sitemap.xml');
    expect(sitemap).toContain(`<loc>https://scripturetolife.org${base}</loc>`);
    for (const id of PACK_IDS) expect(sitemap).toContain(`<loc>https://scripturetolife.org${base}studies/${id}/</loc>`);
    expect(read(dist, 'robots.txt')).toContain(`Sitemap: https://scripturetolife.org${base}sitemap.xml`);
    const png = fs.readFileSync(path.join(dist, 'og-image.png'));
    expect(png.toString('ascii', 1, 4)).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
  });

  it('OpenCC: the 繁→简 and 简→繁 tables ship in separate chunks (a 简 reader loads only the small one)', () => {
    const assets = path.join(dist, 'assets');
    const js = fs.readdirSync(assets).filter(f => f.endsWith('.js')).map(f => ({ f, text: read(assets, f) }));
    const t2cn = js.filter(a => a.text.includes(T2CN_MARKER));
    const cn2t = js.filter(a => a.text.includes(CN2T_MARKER));
    expect(t2cn.length).toBeGreaterThan(0);
    expect(cn2t.length).toBeGreaterThan(0);
    for (const a of t2cn) {
      expect(a.text.includes(CN2T_MARKER), a.f).toBe(false);
      expect(a.text.length, a.f).toBeLessThan(T2CN_CHUNK_MAX_CHARS);
    }
  });

  it('the pack JSON the presentation loads is still shipped', () => {
    for (const id of PACK_IDS) expect(fs.existsSync(path.join(dist, 'packs', `${id}.json`))).toBe(true);
  });
});
