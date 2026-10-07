// Regression: the icon links hard-coded the old /bible/ base, so once the site moved to the
// root of scripturetolife.org (VITE_BASE_PATH=/) every icon 404'd. Vite prefixes the base onto
// a root-absolute public path by itself, so index.html must name the public file, never a base.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const html = readFileSync(path.join(root, 'index.html'), 'utf-8');
const iconHrefs = [...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*href="([^"]+)"/g)].map(m => m[1]);

describe('index.html icon links', () => {
  it('declares the svg, png and apple-touch icons', () => {
    expect(iconHrefs).toHaveLength(3);
  });

  it.each(iconHrefs)('%s names a file in public/ without hard-coding a base path', href => {
    expect(href.startsWith('/')).toBe(true);
    expect(href.startsWith('/bible/')).toBe(false);
    expect(existsSync(path.join(root, 'public', href.split('?')[0]))).toBe(true);
  });
});
