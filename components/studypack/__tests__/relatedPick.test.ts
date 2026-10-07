/**
 * relatedPick.test.ts — question-aware related verses (ADR-0016)
 *
 * The pool (real committed xref files), the pick reply parser (exact
 * matches only, junk ignored and counted, cap 6, per-book cap, fill from
 * the vote ranking), and the chooser's fallbacks — error, timeout, empty,
 * all-invalid — each reported, never silent (R5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseStudyPack, StudyPack } from '../packTypes';
import { clearExternalVerseCache } from '../externalVerses';
import {
  RELATED_VERSES_MAX, RELATED_PER_BOOK, XrefChapter, PassageSpan, RankedTarget,
  rankPool, rankRelated, capByBook, targetLabel, loadRelatedVerses, lastRelatedVerses, clearRelatedVersesCache,
} from '../relatedVerses';
import {
  QUESTION_AWARE_ENABLED, RELATED_POOL_MAX, PICK_TIMEOUT_MS, PICK_MAX_TOKENS,
  pickCandidates, buildPickBody, parsePickReply, mergePicks, questionAwareChooser, PickSender,
} from '../relatedPick';
import { isSecondHop, widenPool } from '../relatedSecondHop';
import { PICK_SYSTEM_PROMPT, formatPickRequest } from '../../../supabase/functions/_shared/aiPrompts';
import { TEST_PACK_PATH } from './fixtures';
import { stubBundledFetch } from './bundledFetch';

const XREF_DIR = path.resolve(__dirname, '../../../public/bible-data/xref');
const xref = (book: string, chapter: number): XrefChapter => JSON.parse(readFileSync(path.join(XREF_DIR, book, `${chapter}.json`), 'utf-8'));
const span = (bookId: string, chapter: number, from: number, to: number): PassageSpan =>
  ({ bookId, chapter, verses: new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i)) });

const ROM8 = span('ROM', 8, 18, 30);
const romPool = rankPool(xref('ROM', 8), ROM8).targets;
const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));

const target = (ref: string, bookId = ref.split('.')[0]): RankedTarget =>
  ({ ref, bookId, chapter: Number(ref.split('.')[1]), from: Number(ref.split('.')[2]), to: Number(ref.split('.')[2]), score: 1, votes: 1, focus: false, seeds: [] });

beforeEach(() => {
  clearExternalVerseCache();
  clearRelatedVersesCache();
  vi.unstubAllGlobals();
});

describe('the switch and limits', () => {
  it('is off until evaluated (ADR-0016)', () => {
    expect(QUESTION_AWARE_ENABLED).toBe(false);
    expect([RELATED_POOL_MAX, PICK_TIMEOUT_MS, PICK_MAX_TOKENS]).toEqual([120, 3000, 160]);
  });
});

describe('the pool (Romans 8:18–30, real cross-references)', () => {
  it('holds the verses the vote top 6 missed: Isaiah 65:17 and Revelation 21:1', () => {
    const top = capByBook(romPool).map(t => t.ref);
    for (const ref of ['ISA.65.17', 'REV.21.1']) {
      expect(romPool.map(t => t.ref)).toContain(ref);
      expect(top).not.toContain(ref);
    }
  });

  it('drops passage verses and overlaps, keeps rank order; the vote top 6 = rankRelated (ADR-0015 unchanged)', () => {
    for (const t of romPool) expect(t.bookId === 'ROM' && t.chapter === 8 && t.from <= 30 && t.to >= 18).toBe(false);
    const same = (a: RankedTarget, b: RankedTarget) => a.bookId === b.bookId && a.chapter === b.chapter && a.from <= b.to && b.from <= a.to;
    romPool.forEach((a, i) => romPool.slice(i + 1).forEach(b => expect(same(a, b)).toBe(false)));
    for (let i = 1; i < romPool.length; i++) expect(romPool[i - 1].score).toBeGreaterThanOrEqual(romPool[i].score);
    expect(capByBook(romPool)).toEqual(rankRelated(xref('ROM', 8), ROM8).targets);
  });

  it('the pick call sees at most RELATED_POOL_MAX candidates, ref + bilingual label, no verse text', () => {
    const big = Array.from({ length: 200 }, (_, i) => target(`PSA.${i + 1}.1`));
    expect(pickCandidates(big)).toHaveLength(RELATED_POOL_MAX);
    const isa = pickCandidates(romPool).find(c => c.ref === 'ISA.65.17');
    expect(isa).toEqual({ ref: 'ISA.65.17', label: '以赛亚书 65:17 · Isaiah 65:17' });
    expect(targetLabel(target('HEB.5.12'))).toBe('希伯来书 5:12 · Hebrews 5:12');
  });

  it('the pick body is data only: no system message, small cap, reasoning off', () => {
    const cands = pickCandidates(romPool.slice(0, 2));
    const body = JSON.parse(buildPickBody('罗马书 8:18–30 · Romans 8:18–30', 'Q?', cands, 'm'));
    expect(body).toEqual({
      model: 'm', stream: true, max_tokens: PICK_MAX_TOKENS, temperature: 0, reasoning: { enabled: false, exclude: true },
      messages: [{ role: 'user', content: formatPickRequest('罗马书 8:18–30 · Romans 8:18–30', 'Q?', cands) }],
    });
    expect(body.messages[0].content).not.toContain(PICK_SYSTEM_PROMPT);
    expect(body.messages[0].content.split('\n').slice(3)).toEqual(cands.map(c => `${c.ref} ${c.label}`));
  });
});

describe('parsePickReply + mergePicks', () => {
  const pool = ['PSA.1.1', 'PSA.2.1', 'PSA.3.1', 'ISA.1.1', 'ISA.2.1', 'JHN.1.1', 'ROM.1.1', 'HEB.1.1', 'REV.1.1'].map(r => target(r));

  it('exact matches only (a ref, or its whole list line); junk and repeats ignored and counted', () => {
    const reply = `ISA.2.1\n  REV.1.1  \n1. JHN.1.1\nIsaiah 1:1\nISA.2.1\nPSA.9.9\n${'HEB.1.1'} ${targetLabel(pool[7])}\n\n`;
    const { picked, ignored } = parsePickReply(reply, pool);
    expect(picked.map(t => t.ref)).toEqual(['ISA.2.1', 'REV.1.1', 'HEB.1.1']);
    expect(ignored).toEqual(['1. JHN.1.1', 'Isaiah 1:1', 'ISA.2.1', 'PSA.9.9']);
  });

  it('a candidate beyond RELATED_POOL_MAX was never shown, so it does not count', () => {
    const big = Array.from({ length: RELATED_POOL_MAX + 1 }, (_, i) => target(`PSA.${i + 1}.1`));
    expect(parsePickReply(`PSA.${RELATED_POOL_MAX + 1}.1`, big).picked).toEqual([]);
  });

  it('at most 6 picks; per-book cap; fewer than 6 → filled from the vote ranking', () => {
    const all = parsePickReply(pool.map(t => t.ref).reverse().join('\n'), pool);
    expect(all.picked).toHaveLength(RELATED_VERSES_MAX);
    const psalms = parsePickReply('PSA.3.1\nPSA.2.1\nPSA.1.1\nREV.1.1', pool).picked;
    const merged = mergePicks(psalms, pool).map(t => t.ref);
    expect(merged.slice(0, 3)).toEqual(['PSA.3.1', 'PSA.2.1', 'REV.1.1']);
    expect(merged.slice(3)).toEqual(['ISA.1.1', 'ISA.2.1', 'JHN.1.1']);
    expect(merged.filter(r => r.startsWith('PSA')).length).toBeLessThanOrEqual(RELATED_PER_BOOK);
  });
});

describe('questionAwareChooser — never blocks the answer', () => {
  const byVotes = capByBook(romPool);
  const romWide = () => widenPool(romPool, ROM8, RELATED_POOL_MAX);
  const choose = (send: PickSender, timeoutMs?: number) =>
    questionAwareChooser({ passageRef: 'Romans 8:18–30', question: 'renewed creation?', model: 'm', signal: new AbortController().signal, send, timeoutMs })(romPool, byVotes, ROM8);
  beforeEach(() => { stubBundledFetch(); });

  it('a valid reply → source pick, the picks first, filled from votes, the fill reported', async () => {
    const out = await choose(async () => 'ISA.65.17\nREV.21.1\nnonsense');
    expect(out.source).toBe('pick');
    expect(out.targets.slice(0, 2).map(t => t.ref)).toEqual(['ISA.65.17', 'REV.21.1']);
    expect(out.targets).toHaveLength(RELATED_VERSES_MAX);
    expect(out.warnings).toEqual(['pick ignored 1 line(s): nonsense', 'pick gave 2 valid, 4 filled from votes']);
  });

  it.each([
    ['error', async () => { throw new Error('HTTP 429 quota'); }, 'error: HTTP 429 quota'],
    ['empty reply', async () => '  \n', 'empty reply'],
    ['all invalid', async () => 'Isaiah 65:17\nRevelation 21:1', 'no valid picks (2 lines ignored)'],
  ] as Array<[string, PickSender, string]>)('%s → the vote top 6 + the reason', async (_name, send, reason) => {
    const out = await choose(send);
    expect(out).toEqual({ targets: byVotes, source: 'votes', warnings: [`pick fell back to votes: ${reason}`], pool: (await romWide()).targets });
  });

  it('slower than the timeout → aborted, the vote top 6', async () => {
    let aborted = false;
    const slow: PickSender = (_body, signal) => new Promise(resolve => {
      signal.addEventListener('abort', () => { aborted = true; resolve('ISA.65.17'); });
    });
    const out = await choose(slow, 20);
    expect(aborted).toBe(true);
    expect(out).toEqual({ targets: byVotes, source: 'votes', warnings: ['pick fell back to votes: timeout after 20 ms'], pool: (await romWide()).targets });
  });

  it('sends the pick body built from the two-hop pool, and returns that pool', async () => {
    const send = vi.fn<PickSender>(async () => 'ISA.65.17');
    const out = await choose(send);
    const wide = await romWide();
    expect(wide.hop2).toBeGreaterThan(0);
    expect(send.mock.calls[0][0]).toBe(buildPickBody('Romans 8:18–30', 'renewed creation?', pickCandidates(wide.targets), 'm'));
    expect(out.pool).toEqual(wide.targets);
  });

  it('a hop-2 pick is kept; the fill still comes from the vote ranking (hop 1)', async () => {
    const hop2 = (await romWide()).targets.find(isSecondHop)!;
    const out = await choose(async () => hop2.ref);
    expect(out.source).toBe('pick');
    expect(out.targets[0].ref).toBe(hop2.ref);
    expect(out.targets.slice(1)).toEqual(capByBook([hop2, ...romPool]).slice(1));
  });
});

describe('loadRelatedVerses with a chooser (real files, Matthew 6:25–34)', () => {
  it('records the source and the reason in the result (and lastRelatedVerses)', async () => {
    stubBundledFetch();
    const failing = questionAwareChooser({ passageRef: pack.passageRef, question: 'q', model: 'm', signal: new AbortController().signal, send: async () => { throw new Error('down'); } });
    const votes = await loadRelatedVerses(pack, 'q');
    const fell = await loadRelatedVerses(pack, 'q', failing);
    expect(fell.related).toEqual(votes.related);
    expect(fell.source).toBe('votes');
    expect(fell.warnings).toEqual(['pick fell back to votes: error: down']);
    expect(lastRelatedVerses()).toBe(fell);
    const picked = await loadRelatedVerses(pack, 'q', async pool => ({ targets: [pool[10]], source: 'pick', warnings: [] }));
    expect(picked.source).toBe('pick');
    expect(picked.related.map(r => r.ref)).toHaveLength(1);
  });
});
