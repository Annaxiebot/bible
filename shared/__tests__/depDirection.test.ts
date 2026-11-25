/**
 * depDirection.test.ts — the reorg's wall · 依赖方向守卫
 *
 * apps/site and apps/journal may import shared/ but never each other, and
 * shared/ may import neither app, so the pre-reorg mingling cannot recur.
 * Production code only: __tests__ files may cross (a journal test renders
 * the site AuthPanel), which the import graph of shipped code never does.
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
    return /\.tsx?$/.test(name) ? [p] : [];
  });

const offenders = (dir: string, forbidden: RegExp): string[] =>
  sources(path.join(ROOT, dir)).flatMap(f => {
    const hits = [...readFileSync(f, 'utf8').matchAll(/(?:from\s*|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)]
      .map(m => path.relative(ROOT, path.resolve(path.dirname(f), m[1])))
      .filter(spec => forbidden.test(spec));
    return hits.length ? [`${path.relative(ROOT, f)} → ${hits.join(', ')}`] : [];
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
