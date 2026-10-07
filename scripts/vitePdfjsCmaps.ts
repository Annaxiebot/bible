/**
 * vitePdfjsCmaps.ts — serve and ship pdfjs's CMap files · pdfjs 字符映射文件 (ADR-0019 §1)
 *
 * pdfjs needs them to read Chinese PDFs that use predefined CJK encodings
 * (e.g. UniGB-UCS2-H) instead of an embedded ToUnicode map. Dev: a middleware
 * answers <base>pdfjs-cmaps/<file>.bcmap from node_modules. Build: each file
 * is emitted as an asset at the same path. They are fetched only when such a
 * PDF is read; nothing else loads them.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import type { Plugin } from 'vite';
import { PDFJS_CMAPS_DIR } from './pdfjsCmapsDir';

const SOURCE_DIR = path.join(path.dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json')), 'cmaps');
const FILE_NAME = /^[A-Za-z0-9._-]+\.bcmap$/;

function cmapFiles(): string[] {
  return readdirSync(SOURCE_DIR).filter(name => FILE_NAME.test(name));
}

export function pdfjsCmaps(): Plugin {
  let base = '/';
  return {
    name: 'pdfjs-cmaps',
    configResolved(config) { base = config.base; },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const prefix = `${base}${PDFJS_CMAPS_DIR}/`;
        const url = req.url?.split('?')[0] ?? '';
        const name = url.startsWith(prefix) ? url.slice(prefix.length) : '';
        const file = path.join(SOURCE_DIR, name);
        if (!FILE_NAME.test(name) || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/octet-stream');
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const name of cmapFiles()) {
        this.emitFile({ type: 'asset', fileName: `${PDFJS_CMAPS_DIR}/${name}`, source: readFileSync(path.join(SOURCE_DIR, name)) });
      }
    },
  };
}
