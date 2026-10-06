// carry-previous-assets.sh against a throwaway git repo shaped like gh-pages.
// Regression: right after a deploy, a cached index.html asked for bundles the
// orphan deploy had removed, and the site rendered blank.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(__dirname, '../carry-previous-assets.sh');
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };

let repo: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, env: GIT_ENV, encoding: 'utf8' });
const run = (ref: string) => execFileSync('bash', [SCRIPT, 'dist', ref], { cwd: repo, env: GIT_ENV, encoding: 'utf8' });

function writeDist(files: Record<string, string>): void {
  rmSync(join(repo, 'dist'), { recursive: true, force: true });
  mkdirSync(join(repo, 'dist/assets'), { recursive: true });
  for (const [name, body] of Object.entries(files)) writeFileSync(join(repo, 'dist/assets', name), body);
}

/** Publish dist/ as an orphan commit on the "live" branch, like force_orphan does. */
function deploy(): void {
  git('--work-tree=dist', 'add', '-A');
  const sha = git('commit-tree', git('write-tree').trim(), '-m', 'deploy').trim();
  git('update-ref', 'refs/heads/live', sha);
  git('read-tree', '--empty');
}

const assets = () => readdirSync(join(repo, 'dist/assets')).sort();

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'carry-assets-'));
  git('init', '-q');
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('carry-previous-assets.sh', () => {
  it('first deploy (no live ref): carries nothing and writes the manifest', () => {
    writeDist({ 'index-A.js': 'a' });
    expect(run('live')).toContain('nothing to carry');
    expect(assets()).toEqual(['index-A.js']);
    expect(readFileSync(join(repo, 'dist/assets-manifest.txt'), 'utf8').trim()).toBe('index-A.js');
  });

  it('keeps the previous build one more round, byte for byte, and never two', () => {
    writeDist({ 'index-A.js': 'build A', 'logo.png': 'png' });
    run('live'); deploy();

    writeDist({ 'index-B.js': 'build B', 'logo.png': 'png' });
    run('live');
    expect(assets()).toEqual(['index-A.js', 'index-B.js', 'logo.png']);
    expect(readFileSync(join(repo, 'dist/assets/index-A.js'), 'utf8')).toBe('build A');
    expect(readFileSync(join(repo, 'dist/assets-manifest.txt'), 'utf8').split('\n').filter(Boolean))
      .toEqual(['index-B.js', 'logo.png']);
    deploy();

    writeDist({ 'index-C.js': 'build C', 'logo.png': 'png' });
    run('live');
    expect(assets()).toEqual(['index-B.js', 'index-C.js', 'logo.png']);
  });

  it('a live site from before the manifest: carries all of its assets once', () => {
    writeDist({ 'index-OLD.js': 'old' });
    deploy();
    writeDist({ 'index-NEW.js': 'new' });
    run('live');
    expect(assets()).toEqual(['index-NEW.js', 'index-OLD.js']);
  });
});
