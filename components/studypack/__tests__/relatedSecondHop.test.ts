/**
 * relatedSecondHop.test.ts — the pick pool widened by one hop (ADR-0016, second attempt)
 *
 * Fixtures pin the scoring (weight × parent score × normalised link, summed
 * per target), the exclusions (passage, any hop-1 candidate, overlaps), the
 * cap, the bound on chapter loads and the reported load failures (R5).
 * The real committed xref files pin what the data gives for the verses the
 * first run missed — including the ones it cannot reach (R14: assert the
 * data, not the hope).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { PassageSpan, RankedTarget, XrefChapter, capByBook, clearRelatedVersesCache, rankPool } from '../relatedVerses';
import { RELATED_POOL_MAX } from '../relatedPick';
import {
  SECOND_HOP_SEEDS, SECOND_HOP_WEIGHT, XrefLoader, isSecondHop, mergePools, secondHopTargets, widenPool,
} from '../relatedSecondHop';
import { stubBundledFetch } from './bundledFetch';

const XREF_DIR = path.resolve(__dirname, '../../../public/bible-data/xref');
const xref = (book: string, chapter: number): XrefChapter => JSON.parse(readFileSync(path.join(XREF_DIR, book, `${chapter}.json`), 'utf-8'));
const span = (bookId: string, chapter: number, from: number, to: number): PassageSpan =>
  ({ bookId, chapter, verses: new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i)) });
const target = (ref: string, score: number): RankedTarget => {
  const [bookId, chapter, verse] = ref.split('.');
  return { ref, bookId, chapter: Number(chapter), from: Number(verse), to: Number(verse), score, votes: 1, focus: false, seeds: [1] };
};
const refs = (list: readonly RankedTarget[]) => list.map(t => t.ref);

beforeEach(() => {
  clearRelatedVersesCache();
  vi.unstubAllGlobals();
});

describe('the limits', () => {
  it('10 seeds, half weight', () => {
    expect([SECOND_HOP_SEEDS, SECOND_HOP_WEIGHT, RELATED_POOL_MAX]).toEqual([10, 0.5, 120]);
  });
});

describe('secondHopTargets (fixtures)', () => {
  const passage = span('MAT', 6, 25, 34);
  const hop1 = [target('PHP.4.6', 2), target('PSA.55.22', 1), target('LUK.12.31', 1)];
  const files = new Map<string, XrefChapter>([
    ['PHP/4', { '6': [['2TH.3.10', 10], ['MAT.6.25', 10], ['PSA.55.22', 8], ['PHP.4.7', 6], ['PRO.6.6-8', 5]] }],
    ['PSA/55', { '22': [['PRO.6.7', 4], ['1PE.5.7', 2]] }],
  ]);

  it('scores weight × parent score × normalised link, sums across parents, records via', () => {
    const out = secondHopTargets(hop1, files, hop1, passage, []);
    const by = new Map(out.map(t => [t.ref, t]));
    expect(by.get('2TH.3.10')!.score).toBeCloseTo(SECOND_HOP_WEIGHT * 2 * 1);
    expect(by.get('PRO.6.6-8')!.score).toBeCloseTo(SECOND_HOP_WEIGHT * 2 * 0.5);
    expect(by.get('1PE.5.7')!.score).toBeCloseTo(SECOND_HOP_WEIGHT * 1 * 0.5);
    expect(by.get('PRO.6.7')!.via).toEqual(['PSA.55.22']);
    expect(out.every(t => isSecondHop(t) && !t.focus && t.seeds.length === 0)).toBe(true);
  });

  it('drops the passage, every hop-1 candidate, and the parent\'s own verse; a parent with no file adds nothing', () => {
    const out = refs(secondHopTargets(hop1, files, hop1, passage, []));
    expect(out).not.toContain('MAT.6.25');
    expect(out).not.toContain('PSA.55.22');
    expect(out).not.toContain('PHP.4.6');
    expect(out.some(r => r.startsWith('LUK'))).toBe(false);
  });

  it('collects malformed refs instead of dropping them silently', () => {
    const malformed: string[] = [];
    secondHopTargets([hop1[0]], new Map([['PHP/4', { '6': [['bad ref', 3]] }]]), hop1, passage, malformed);
    expect(malformed).toEqual(['bad ref']);
  });
});

describe('mergePools', () => {
  const hop1 = [target('PSA.1.1', 3), target('PSA.2.1', 1), target('PSA.3.1', 0.1)];
  const hop2 = [{ ...target('ISA.1.1', 2), hop: 2 as const, via: [] }, { ...target('ISA.1.1', 0.5), ref: 'ISA.1.1-2', to: 2, hop: 2 as const, via: [] }];

  it('one rank order; hop 1 keeps its own order; overlaps dropped; cut at max', () => {
    expect(refs(mergePools(hop1, hop2, 10))).toEqual(['PSA.1.1', 'ISA.1.1', 'PSA.2.1', 'PSA.3.1']);
    expect(refs(mergePools(hop1, hop2, 2))).toEqual(['PSA.1.1', 'ISA.1.1']);
  });
});

describe('widenPool: bounded loads, failures reported', () => {
  const passage = span('ROM', 8, 18, 30);
  const pool = rankPool(xref('ROM', 8), passage).targets;

  it('loads at most SECOND_HOP_SEEDS distinct chapters; a failed one is skipped and named', async () => {
    const load = vi.fn<XrefLoader>(async (book, chapter) => {
      if (book === 'JER') throw new Error('cross-references JER/12: HTTP 404');
      return xref(book, chapter);
    });
    const out = await widenPool(pool, passage, RELATED_POOL_MAX, load);
    expect(load.mock.calls.length).toBeLessThanOrEqual(SECOND_HOP_SEEDS);
    expect(out.chapters).toBe(load.mock.calls.length);
    expect(out.warnings).toEqual(['second hop skipped JER/12: cross-references JER/12: HTTP 404']);
    expect(out.targets.length).toBeLessThanOrEqual(RELATED_POOL_MAX);
    expect(out.hop2).toBe(out.targets.filter(isSecondHop).length);
    expect(out.hop2).toBeGreaterThan(0);
    expect(out.targets.some(t => isSecondHop(t) && t.via.includes('JER.12.4'))).toBe(false);
  });

  it('every loader failing → hop 1 alone (cut at max), every chapter named, never rejects', async () => {
    const out = await widenPool(pool, passage, 50, async () => { throw new Error('down'); });
    expect(out.targets).toEqual(pool.slice(0, 50));
    expect(out.hop2).toBe(0);
    expect(out.warnings).toHaveLength(out.chapters);
  });
});

describe('the real committed files (the verses the first run missed)', () => {
  const MAT6 = span('MAT', 6, 25, 34);
  const ROM8 = span('ROM', 8, 18, 30);
  const has = (list: readonly RankedTarget[], ref: string) => list.some(t => t.ref === ref || t.ref.startsWith(`${ref}-`));

  it('Matthew 6:25–34: hop 2 adds verses (e.g. Proverbs 3:5–6), the vote top 6 is unchanged', async () => {
    stubBundledFetch();
    const hop1 = rankPool(xref('MAT', 6), MAT6).targets;
    const wide = await widenPool(hop1, MAT6, RELATED_POOL_MAX);
    expect(wide.warnings).toEqual([]);
    expect(hop1).toHaveLength(71);
    expect(wide.targets).toHaveLength(RELATED_POOL_MAX);
    expect(wide.hop2).toBeGreaterThan(40);
    expect(wide.targets.find(t => t.ref === 'PRO.3.5-6')).toMatchObject({ hop: 2 });
    expect(capByBook(hop1)).toEqual(capByBook(wide.targets.filter(t => !isSecondHop(t))));
    expect(wide.targets.filter(t => !isSecondHop(t))).toEqual(hop1.slice(0, RELATED_POOL_MAX - wide.hop2));
  });

  it('Matthew 6: 2 Thessalonians 3:10, Genesis 2:15 and Proverbs 6:6–8 are NOT reachable in two hops (no hop-1 candidate links to them)', async () => {
    stubBundledFetch();
    const all = rankPool(xref('MAT', 6), MAT6).targets;
    const wide = await widenPool(all, MAT6, Number.MAX_SAFE_INTEGER);
    for (const ref of ['2TH.3.10', 'GEN.2.15', 'PRO.6.6', 'PRO.6.7', 'PRO.6.8']) expect(has(wide.targets, ref)).toBe(false);
  });

  it('Romans 8:18–30: Isaiah 65:17 and Revelation 21:1 stay inside the pick\'s first RELATED_POOL_MAX', async () => {
    stubBundledFetch();
    const wide = await widenPool(rankPool(xref('ROM', 8), ROM8).targets, ROM8, RELATED_POOL_MAX);
    for (const ref of ['ISA.65.17', 'REV.21.1']) expect(has(wide.targets, ref)).toBe(true);
  });
});
