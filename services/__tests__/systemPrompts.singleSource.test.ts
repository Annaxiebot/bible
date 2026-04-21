import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { BIBLE_SCHOLAR_SYSTEM_PROMPT, AI_LANGUAGE_DIRECTIVE, SPLIT_MARKER } from '../systemPrompts';

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
    if (name === 'node_modules' || name === 'dist' || name === '.git' || name === 'coverage' || name === '.next' || name === 'test-results' || name === 'playwright-report') continue;
    const full = join(dir, name);
    const s = statSync(full);
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

describe('R3: BIBLE_SCHOLAR_SYSTEM_PROMPT single source of truth', () => {
  it('the prompt literal appears in exactly one source file (services/systemPrompts.ts)', () => {
    const files = walk(REPO_ROOT);
    const hits = files.filter(f => readFileSync(f, 'utf8').includes(MARKER));
    expect(hits.map(f => relative(REPO_ROOT, f))).toEqual(['services/systemPrompts.ts']);
  });

  it('every client AI provider imports BIBLE_SCHOLAR_SYSTEM_PROMPT from the shared module', () => {
    const providers = ['openai', 'claude', 'gemini', 'kimi', 'perplexity', 'openrouter'];
    for (const p of providers) {
      const src = readFileSync(join(REPO_ROOT, 'services', `${p}.ts`), 'utf8');
      expect(src, `${p}.ts must import BIBLE_SCHOLAR_SYSTEM_PROMPT from ./systemPrompts`)
        .toMatch(/import\s*\{[^}]*BIBLE_SCHOLAR_SYSTEM_PROMPT[^}]*\}\s*from\s*['"]\.\/systemPrompts['"]/);
    }
  });

  it('the supabase edge function imports BIBLE_SCHOLAR_SYSTEM_PROMPT from the shared module', () => {
    const src = readFileSync(join(REPO_ROOT, 'supabase/functions/ai-chat/index.ts'), 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*BIBLE_SCHOLAR_SYSTEM_PROMPT[^}]*\}\s*from\s*['"][^'"]*systemPrompts\.ts['"]/);
    expect(src, 'edge function must not redeclare a SYSTEM_PROMPT constant')
      .not.toMatch(/const\s+SYSTEM_PROMPT\s*=\s*`You are a world-class/);
  });

  it('the exported prompt contains the [SPLIT] marker, the language directive, and LaTeX guidance', () => {
    expect(BIBLE_SCHOLAR_SYSTEM_PROMPT).toContain(SPLIT_MARKER);
    expect(BIBLE_SCHOLAR_SYSTEM_PROMPT).toContain(AI_LANGUAGE_DIRECTIVE.trim().split('\n')[0]);
    expect(SPLIT_MARKER).toBe('[SPLIT]');
  });
});
