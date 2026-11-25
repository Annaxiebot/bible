/**
 * depDirection.test.ts — the reorg's wall · 依赖方向守卫
 *
 * apps/site and apps/journal may import shared/ but never each other, and
 * shared/ may import neither app, so the pre-reorg mingling cannot recur.
 * Production code only: __tests__ files may cross (a journal test renders
 * the site AuthPanel), which the import graph of shipped code never does.
 * Known limits (heuristic scan): template-literal specifiers built at runtime,
 * and glob patterns judged by their written prefix (a /**-wide glob is not
 * expanded against the filesystem); scripts/ (build-time, not shipped) is out
 * of scope. new URL('…') with a non-import.meta.url base can false-positive,
 * which fails loud, not silent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(tsx?|jsx?|mjs|cjs)$/.test(name) ? [p] : [];
  });

/** Every quoted module specifier: static/dynamic import, export-from, import.meta.glob, new URL(…, import.meta.url). */
const SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*|import\.meta\.glob\s*\(\s*\[?\s*|new\s+URL\s*\(\s*)['"`]([^'"`]+)['"`]/g;

/** Repo-relative form of a specifier: `@/x` and `/x` resolve from the root (Vite + tsconfig alias), `./x` from the importer. */
const resolveSpec = (importer: string, spec: string): string => {
  if (spec.startsWith('@/')) return path.normalize(spec.slice(2));
  if (spec.startsWith('/')) return path.normalize(spec.slice(1));
  return path.relative(ROOT, path.resolve(path.dirname(importer), spec));
};

const offenders = (dir: string, forbidden: RegExp): string[] =>
  sources(path.join(ROOT, dir)).flatMap(f => {
    const hits = [...readFileSync(f, 'utf8').matchAll(SPECIFIER)]
      .map(m => resolveSpec(f, m[1]))
      .filter(spec => forbidden.test(spec));
    return hits.length ? [`${path.relative(ROOT, f)} → ${hits.join(', ')}`] : [];
  });

describe('the scanner itself (so the suite can never pass vacuously)', () => {
  it('SPECIFIER matches each import form and resolveSpec maps it into the repo', () => {
    const src = `import a from 'apps/x';
      const b = await import('./y');
      export { c } from '@/apps/journal/App';
      const d = require('/shared/z');
      const e = import.meta.glob(['/apps/site/studypack/*.ts']);
      const f = new URL('../apps/site/w.png', import.meta.url);`;
    const specs = [...src.matchAll(SPECIFIER)].map(m => resolveSpec(path.join(ROOT, 'shared/fake.ts'), m[1]));
    expect(specs).toEqual(['shared/apps/x', 'shared/y', 'apps/journal/App', 'shared/z', 'apps/site/studypack/*.ts', 'apps/site/w.png']);
    expect(resolveSpec(path.join(ROOT, 'shared/fake.ts'), '@/shared/../apps/site/studypack/packTypes'))
      .toBe('apps/site/studypack/packTypes');
  });
});

describe('dependency direction between apps/ and shared/', () => {
  it('apps/site never imports apps/journal', () => {
    expect(offenders('apps/site', /^apps\/journal\//)).toEqual([]);
  });
  it('apps/journal never imports apps/site', () => {
    expect(offenders('apps/journal', /^apps\/site\//)).toEqual([]);
  });
  it('shared/ never imports either app', () => {
    expect(offenders('shared', /^apps\//)).toEqual([]);
  });
});
