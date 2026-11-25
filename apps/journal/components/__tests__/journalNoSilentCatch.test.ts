/**
 * journalNoSilentCatch.test.ts — no silent catch in the journal · 日记无静默捕获 (R5)
 *
 * The journal's AI actions used to catch their failure and show nothing
 * (a signed-out user clicked Summarize and nothing happened). This source
 * scan pins the invariant for every journal file: a catch — `catch {…}` or
 * `.catch(…)` — whose body only logs (console.*), returns an empty value or
 * a canned string, or sets state to one (setX([]) / setX(null) /
 * setX('Could not…')…) must carry an `R5` comment saying why silence is
 * correct. Anything else
 * must surface the error (rethrow, InlineAIError, a fallback that acts).
 *
 * KNOWN_GAPS is a ratchet: non-AI silent catches found when this scan was
 * written, listed so they stay visible. A new silent catch fails; fixing a
 * listed one also fails until it is removed from the list.
 * To cover more files, add them to SCANNED_FILES.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');

const SCANNED_FILES = [
  'components/JournalView.tsx',
  'components/JournalEditor.tsx',
  'components/JournalBlockEditor.tsx',
  'components/JournalPrintDialog.tsx',
  'components/NotabilityEditor.tsx',
  'services/journalAIService.ts',
];

/** file → a snippet unique to the silent catch body. Non-AI; each needs its own fix (surface the failure). */
const KNOWN_GAPS: ReadonlyArray<{ file: string; snippet: string }> = [
  { file: 'components/JournalView.tsx', snippet: '[Journal] Sync failed' },
  { file: 'components/JournalView.tsx', snippet: '[Journal] Failed to create entry' },
  { file: 'components/NotabilityEditor.tsx', snippet: 'Image insert failed' },
];

const R5_MARK = /R5/;
/** Empty values and canned string literals ('Sorry, something went wrong.'). */
const EMPTY_VALUE = String.raw`(?:\[\]|\{\}|null|undefined|false|0|'[^'\n]*'|"[^"\n]*")`;
/** Statements that only log, return nothing useful, or reset state to empty. */
const SILENCING = [
  /console\.\w+\((?:[^()]|\([^()]*\))*\);?/g,
  new RegExp(String.raw`return(?:\s+${EMPTY_VALUE})?\s*;?`, 'g'),
  new RegExp(String.raw`set\w+\(\s*${EMPTY_VALUE}\s*\);?`, 'g'),
  /if\s*\([^()]*\)/g,
];

/** Index just past the bracket matching the one at `open`. */
function matchBracket(src: string, open: number): number {
  const pair: Record<string, string> = { '{': '}', '(': ')' };
  const opener = src[open];
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === opener) depth++;
    else if (src[i] === pair[opener] && --depth === 0) return i + 1;
  }
  throw new Error(`unbalanced ${opener} at ${open}`);
}

interface CatchSite { line: number; body: string }

/** Every `catch (e) {…}` body and every `.catch(handler)` handler in the source. */
function findCatches(src: string): CatchSite[] {
  const sites: CatchSite[] = [];
  const lineOf = (i: number) => src.slice(0, i).split('\n').length;
  for (const m of src.matchAll(/\bcatch\s*(\([^)]*\))?\s*\{/g)) {
    const open = m.index! + m[0].length - 1;
    sites.push({ line: lineOf(m.index!), body: src.slice(open + 1, matchBracket(src, open) - 1) });
  }
  for (const m of src.matchAll(/\.catch\(/g)) {
    const open = m.index! + m[0].length - 1;
    const handler = src.slice(open + 1, matchBracket(src, open) - 1);
    const arrow = handler.match(/^\s*(?:\([^)]*\)|\w+)\s*=>\s*([\s\S]*)$/);
    sites.push({ line: lineOf(m.index!), body: arrow ? arrow[1].replace(/^\s*\{([\s\S]*)\}\s*$/, '$1') : handler });
  }
  return sites;
}

/** Silent = only silencing statements, and no R5 comment explaining why. */
function isSilent(body: string): boolean {
  if (R5_MARK.test(body)) return false;
  let rest = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const re of SILENCING) rest = rest.replace(re, '');
  return rest.replace(/[\s{};]/g, '') === '';
}

function silentSites(file: string) {
  const src = readFileSync(path.join(ROOT, file), 'utf8');
  return findCatches(src).filter(c => isSilent(c.body)).map(c => ({ file, ...c }));
}

describe('scanner (positive controls — a scan that finds nothing must not pass vacuously)', () => {
  it('flags the silent shapes the journal had', () => {
    const bad = [
      `try { a(); } catch { setSummaryResult(null); } finally { done(); }`,
      `try { a(); } catch (err) { console.warn('[JournalAI] failed:', err); return []; }`,
      `p.catch(() => {});`,
      `p.catch(() => setTimelineGroups([]));`,
      `p.catch(() => { if (!cancelled) { setRelated([]); setLoading(false); } });`,
      `try { a(); } catch {}`,
      `try { a(); } catch (err) { console.warn('[JournalAI] Chat failed:', err); return 'Sorry, I could not process your question.'; }`,
      `try { a(); } catch { setProfileText('Could not generate profile at this time.'); }`,
    ];
    for (const src of bad) {
      const sites = findCatches(src);
      expect(sites.length, src).toBeGreaterThan(0);
      expect(sites.some(s => isSilent(s.body)), src).toBe(true);
    }
  });

  it('passes a catch that surfaces, rethrows, falls back, or explains itself with R5', () => {
    const ok = [
      `try { a(); } catch (err) { setX(null); aiFailures.fail('summary', err); }`,
      `try { a(); } catch (err) { throw new Error('ctx: ' + err); }`,
      `try { a(); } catch { insertImageIntoEditor(dataUrl); }`,
      `try { a(); } catch { /* R5: optional decoration */ return ''; }`,
      `p.catch(() => { // R5: background\n });`,
    ];
    for (const src of ok) expect(findCatches(src).every(s => !isSilent(s.body)), src).toBe(true);
  });

  it('finds catches in every scanned file (the file list is live)', () => {
    for (const file of SCANNED_FILES) expect(() => readFileSync(path.join(ROOT, file), 'utf8'), file).not.toThrow();
    expect(findCatches(readFileSync(path.join(ROOT, 'components/JournalView.tsx'), 'utf8')).length).toBeGreaterThan(10);
  });
});

describe('journal: no silent catch (R5)', () => {
  const all = SCANNED_FILES.flatMap(silentSites);
  const isKnown = (s: { file: string; body: string }) => KNOWN_GAPS.some(g => g.file === s.file && s.body.includes(g.snippet));

  it('every silent catch carries an R5 comment (or is a listed known gap)', () => {
    const offenders = all.filter(s => !isKnown(s)).map(s => `${s.file}:${s.line}  ${s.body.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });

  it('known gaps are still gaps (remove an entry once it is fixed)', () => {
    for (const gap of KNOWN_GAPS) {
      expect(all.some(s => s.file === gap.file && s.body.includes(gap.snippet)), `${gap.file}: ${gap.snippet}`).toBe(true);
    }
  });
});
