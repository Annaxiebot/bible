/**
 * vitestExclude.test.ts — pins the test-collection boundary.
 *
 * `.claude/worktrees/` holds other sessions' git worktrees, each a full copy
 * of the repo. When vitest collected them, stale copies of test files ran
 * alongside the main tree and one old copy flaked the whole combined run.
 *
 * The config is read as source text: importing it loads @vitejs/plugin-react
 * (esbuild refuses jsdom) and the node environment lacks `window` for setup.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve(__dirname, '../../vitest.config.ts');
const EXPECTED_EXCLUDES = ['**/.claude/**', '**/worktrees/**'];

function testExcludeList(source: string): string[] {
  const match = /exclude:\s*\[([^\]]*)\]/.exec(source);
  if (!match) return [];
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

describe('vitest test collection', () => {
  it('excludes .claude worktree copies of the repo', () => {
    const exclude = testExcludeList(readFileSync(CONFIG_PATH, 'utf-8'));
    for (const pattern of EXPECTED_EXCLUDES) {
      expect(exclude).toContain(pattern);
    }
  });
});
