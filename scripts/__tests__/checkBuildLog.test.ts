// check-build-log.mjs — the CI "zero warnings" gate on `vite build` output.
// Regression (2026-10-23, CI job 120268709736): the old `grep -iE "error|..."`
// matched the asset names dist/assets/AIErrorLine-*.js and InlineAIError-*.js,
// so a clean build failed CI. The gate must still catch real errors and
// duplicate/unused warnings, and the step must keep vite's own exit status.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findBuildLogProblems } from '../check-build-log.mjs';

const SCRIPT = resolve(__dirname, '../check-build-log.mjs');

// Lines as vite 6 prints them; under CI picocolors colours them.
const CLEAN_LOG = [
  'vite v6.4.5 building for production...',
  'transforming...',
  '✓ 744 modules transformed.',
  'rendering chunks...',
  '[plugin vite:reporter] ',
  '(!) /repo/components/shared/AIErrorLine.tsx is dynamically imported by /repo/App.tsx but also statically imported by /repo/components/InlineAIError.tsx, dynamic import will not move module into another chunk.',
  'dist/assets/AIErrorLine-BZ2PK2yZ.js                       0.73 kB │ gzip:   0.41 kB',
  'dist/assets/InlineAIError-Dk0t7-xB.js                     2.83 kB │ gzip:   1.66 kB',
  '\x1b[2mdist/\x1b[22m\x1b[36massets/ErrorBoundary-Ab12Cd34.js  \x1b[39m\x1b[1m\x1b[2m   1.10 kB\x1b[22m\x1b[1m\x1b[22m\x1b[2m │ gzip:  0.60 kB\x1b[22m',
  '\x1b[33m(!) Some chunks are larger than 1000 kB after minification. Consider:\x1b[39m',
  '✓ built in 39.26s',
].join('\n');

function run(log: string): { status: number; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'build-log-'));
  const file = join(dir, 'build.log');
  writeFileSync(file, log);
  try {
    return { status: 0, out: execFileSync('node', [SCRIPT, file], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { status: err.status, out: err.stdout + err.stderr };
  }
}

describe('findBuildLogProblems', () => {
  it('passes a clean build whose asset and module names contain "Error"', () => {
    expect(findBuildLogProblems(CLEAN_LOG)).toEqual([]);
  });

  it.each([
    'error during build:',
    '\x1b[31merror during build:\x1b[39m',
    '[vite:esbuild] Transform failed with 1 error:',
    '✘ [ERROR] Expected ";" but found "}"',
    'components/shared/AIErrorLine.tsx:3:1: ERROR: Unexpected "}"',
    'Error: Could not resolve "./AIErrorLine" from "components/InlineAIError.tsx"',
    'RollupError: "default" is not exported by "src/x.ts"',
  ])('flags a real error: %s', (line) => {
    expect(findBuildLogProblems(`${CLEAN_LOG}\n${line}`)).toHaveLength(1);
  });

  it.each([
    '▲ [WARNING] Duplicate key "title" in object literal [duplicate-object-key]',
    '\x1b[33mwarning: Duplicate case clause\x1b[39m',
    'warning: "foo" is unused (in src/ErrorView.tsx)',
  ])('flags a duplicate/unused warning: %s', (line) => {
    expect(findBuildLogProblems(`${CLEAN_LOG}\n${line}`)).toHaveLength(1);
  });

  it('reports the original line, without colour codes', () => {
    expect(findBuildLogProblems('\x1b[31merror during build:\x1b[39m')).toEqual(['error during build:']);
  });

  it('fails closed on an empty log', () => {
    expect(findBuildLogProblems('  \n')).toEqual(['build log is empty']);
  });
});

describe('check-build-log.mjs CLI', () => {
  it('exits 0 on a clean log', () => {
    expect(run(CLEAN_LOG).status).toBe(0);
  });

  it('exits 1 and prints the offending line', () => {
    const r = run(`${CLEAN_LOG}\nerror during build:`);
    expect(r.status).toBe(1);
    expect(r.out).toContain('error during build:');
  });

  it('exits 1 on an empty log (e.g. the build printed nothing)', () => {
    expect(run('').status).toBe(1);
  });

  it('exits 2 when the log is missing', () => {
    const missing = (() => {
      try { execFileSync('node', [SCRIPT, '/nonexistent/build.log'], { stdio: 'pipe' }); return 0; }
      catch (e) { return (e as { status: number }).status; }
    })();
    expect(missing).toBe(2);
  });
});

describe('ci.yml build step', () => {
  const ci = readFileSync(resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8');
  const step = ci.slice(ci.indexOf('- name: Build (must succeed with zero warnings)'), ci.indexOf('- name: Security audit'));

  it('keeps vite build\'s exit status through the tee pipe', () => {
    expect(step).toMatch(/set -o pipefail|shell: bash/);
    expect(step).toContain('npm run build 2>&1 | tee build.log');
  });

  it('checks the log with check-build-log.mjs, not a raw grep over asset names', () => {
    expect(step).toContain('node scripts/check-build-log.mjs build.log');
    expect(step).not.toMatch(/grep -iE "error/);
  });
});
