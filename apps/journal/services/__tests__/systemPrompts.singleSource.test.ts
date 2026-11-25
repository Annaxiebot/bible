import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from '../systemPrompts';

// R3 enforcement: the bilingual scholar system prompt lives in services/systemPrompts.ts.
// Every other file that needs it must import — never copy. This test is the tripwire.
// If this test ever fails, whoever duplicated the prompt needs to import it instead.

const REPO_ROOT = resolve(__dirname, '..', '..');
// Derive the marker from the imported constant so this test file itself doesn't
// contain the literal — otherwise walk() would match the test and fail.
const MARKER = BIBLE_SCHOLAR_SYSTEM_PROMPT.split('\n')[0].trim();
const SOURCE_OF_TRUTH = join(REPO_ROOT, 'services/systemPrompts.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    // '.claude' holds throwaway agent worktrees — whole copies of this repo. Walking into them
    // reported the source of truth as duplicated three times and failed this tripwire for a
    // reason that has nothing to do with the source. Scratch directories are not source.
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name === '.claude' || name === 'coverage' || name === '.next' || name === 'test-results' || name === 'playwright-report') continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

// Walking + reading every source file is >10 s under heavy CPU load (every
// read is also scanned by the endpoint antivirus). Do it once at file
// collection, which has no timeout, so the slow I/O never counts against it.
const FILES_WITH_MARKER = walk(REPO_ROOT).filter(f => readFileSync(f, 'utf8').includes(MARKER));

describe('R3: BIBLE_SCHOLAR_SYSTEM_PROMPT single source of truth', () => {
  it('the prompt literal appears in exactly one source file (services/systemPrompts.ts)', () => {
    expect(FILES_WITH_MARKER.map(f => relative(REPO_ROOT, f))).toEqual(['services/systemPrompts.ts']);
  });

  it('the personal app chat imports BIBLE_SCHOLAR_SYSTEM_PROMPT from the shared module', () => {
    const src = readFileSync(join(REPO_ROOT, 'components/ChatInterface.tsx'), 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*BIBLE_SCHOLAR_SYSTEM_PROMPT[^}]*\}\s*from\s*['"]\.\.\/services\/systemPrompts['"]/);
  });

  it('the exported prompt keeps its LaTeX guidance (the language/format rule is pinned in systemPrompts.language.test.ts)', () => {
    expect(BIBLE_SCHOLAR_SYSTEM_PROMPT).toContain('LaTeX');
  });
});
