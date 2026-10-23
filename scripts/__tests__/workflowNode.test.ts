// Every workflow that installs and builds/tests runs Node 24: pdfjs-dist (5.7+ and
// 6.2.108, the GHSA-hq66-cqwq-w95j fix) declares engines ">=22.13.0 || >=24".
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(__dirname, '../../.github/workflows');
const enginesNode = JSON.parse(readFileSync(resolve(__dirname, '../../node_modules/pdfjs-dist/package.json'), 'utf8')).engines.node;

describe.each(readdirSync(DIR).filter(f => f.endsWith('.yml')))('%s', (file) => {
  const yml = readFileSync(resolve(DIR, file), 'utf8');
  const versions = [...yml.matchAll(/node-version:\s*['"]?([^'"\s]+)/g)].map(m => m[1]);

  it('sets up Node 24 wherever it sets up Node', () => {
    expect(versions.every(v => v === '24')).toBe(true);
  });
});

it('pdfjs-dist still accepts Node 24', () => {
  expect(enginesNode).toMatch(/>=24\b/);
});
