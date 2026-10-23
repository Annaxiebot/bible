/**
 * viteSeo.ts — Vite plugin: delivered metadata, homepage fallback, static study pages · SEO 插件
 *
 * `vite build` (any VITE_BASE_PATH; default /bible/, deployed with /):
 *   - index.html gets the homepage description / canonical / Open Graph /
 *     Twitter tags and a static fallback body (scripts/seo/prerender.ts);
 *   - dist/studies/<id>/index.html for EVERY public/packs/*.json (an invalid
 *     pack fails the build rather than shipping an empty shell);
 *   - dist/sitemap.xml, dist/robots.txt and dist/og-image.png.
 * `vite dev` serves the same files on the fly, so links and e2e tests work.
 * The site origin defaults to https://scripturetolife.org (VITE_SITE_ORIGIN overrides).
 */
import path from 'node:path';
import type { Plugin } from 'vite';
import {
  loadPublicPacks, normalizeBase, normalizeOrigin, transformIndexHtml, studyPageHtml,
  sitemapXml, robotsTxt, STUDIES_DIR, SeoSite,
} from './prerender';
import { ogImagePng, OG_IMAGE_FILE } from './ogImage';

export interface SeoOptions {
  /** The pack the homepage features (the landing's SAMPLE_PACK_ID). */
  featuredPackId: string;
  /** Defaults to <root>/public/packs. */
  packsDir?: string;
  origin?: string;
}

export function seoPrerender(options: SeoOptions): Plugin {
  let site: SeoSite = { origin: normalizeOrigin(options.origin), base: '/' };
  let packsDir = options.packsDir ?? '';
  const packs = () => loadPublicPacks(packsDir);

  return {
    name: 'stl-seo-prerender',
    configResolved(config) {
      site = { origin: normalizeOrigin(options.origin ?? process.env.VITE_SITE_ORIGIN), base: normalizeBase(config.base) };
      if (!packsDir) packsDir = path.resolve(config.root, 'public/packs');
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return transformIndexHtml(html, site, packs(), options.featuredPackId);
      },
    },
    generateBundle() {
      const all = packs();
      for (const pack of all) {
        this.emitFile({ type: 'asset', fileName: `${STUDIES_DIR}/${pack.id}/index.html`, source: studyPageHtml(site, pack) });
      }
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(site, all) });
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt(site) });
      this.emitFile({ type: 'asset', fileName: OG_IMAGE_FILE, source: ogImagePng() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (!url.startsWith(site.base)) return next();
        const rest = url.slice(site.base.length);
        const send = (type: string, body: string | Buffer) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', type);
          res.end(body);
        };
        if (rest === 'sitemap.xml') return send('application/xml; charset=utf-8', sitemapXml(site, packs()));
        if (rest === 'robots.txt') return send('text/plain; charset=utf-8', robotsTxt(site));
        if (rest === OG_IMAGE_FILE) return send('image/png', ogImagePng());
        const m = new RegExp(`^${STUDIES_DIR}/([A-Za-z0-9._-]+)/?(index\\.html)?$`).exec(rest);
        if (m) {
          const pack = packs().find(p => p.id === m[1]);
          if (pack) return send('text/html; charset=utf-8', studyPageHtml(site, pack));
        }
        return next();
      });
    },
  };
}
