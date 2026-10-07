/**
 * relatedVerses.test.ts — related verses for Ask AI (ADR-0015 §3, §5)
 *
 * Ranking, caps and exclusions on a hand-made chapter file; then the real
 * committed xref + Bible files (stubBundledFetch serves public/) for the
 * sample pack (马太福音 6:25–34); load failures come back as warnings,
 * never as a silent empty list (R5, R14); the "cited from memory" count.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseStudyPack, StudyPack } from '../packTypes';
import { clearExternalVerseCache } from '../externalVerses';
import {
  RELATED_VERSES_ENABLED, RELATED_VERSES_MAX, RELATED_PER_BOOK, RELATED_VERSES_PER_REF,
  XrefChapter, PassageSpan, parseCompactRef, rankRelated, focusVerses, packPassage,
  loadRelatedVerses, lastRelatedVerses, clearRelatedVersesCache, citedFromMemory,
} from '../relatedVerses';
import { TEST_PACK_PATH } from './fixtures';
import { stubBundledFetch } from './bundledFetch';

const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const PASSAGE: PassageSpan = { bookId: 'MAT', chapter: 6, verses: new Set([25, 26, 27, 28, 29, 30, 31, 32, 33, 34]) };

beforeEach(() => {
  clearExternalVerseCache();
  clearRelatedVersesCache();
  vi.unstubAllGlobals();
});

describe('the switch', () => {
  it('is off until the blind evaluation says otherwise (ADR-0015 release step 3–4)', () => {
    expect(RELATED_VERSES_ENABLED).toBe(false);
  });
});

describe('parseCompactRef', () => {
  it('reads one verse and a range; rejects anything else', () => {
    expect(parseCompactRef('PHP.4.6')).toEqual({ bookId: 'PHP', chapter: 4, from: 6, to: 6 });
    expect(parseCompactRef('1PE.5.6-7')).toEqual({ bookId: '1PE', chapter: 5, from: 6, to: 7 });
    expect(parseCompactRef('Phil.4.6')).toBeNull();
    expect(parseCompactRef('PHP.4')).toBeNull();
  });
});

describe('rankRelated', () => {
  it('scores each link as votes ÷ its seed\'s top vote, sums per target, ranks by the sum', () => {
    const file: XrefChapter = { 25: [['LUK.12.22', 30], ['PHP.4.6', 10]], 34: [['PHP.4.6', 25]] };
    const ranked = rankRelated(file, PASSAGE).targets;
    expect(ranked.map(t => [t.ref, t.score, t.votes, t.seeds])).toEqual([
      ['PHP.4.6', 10 / 30 + 1, 35, [25, 34]], ['LUK.12.22', 1, 30, [25]],
    ]);
  });

  it('one heavily-linked seed cannot crowd out the others: every seed\'s best link scores 1.0', () => {
    const file: XrefChapter = {
      33: [['LUK.12.31', 500], ['MAT.5.6', 480], ['JHN.6.27', 380], ['ROM.14.17', 250]],
      25: [['PHP.4.6', 40]],
      34: [['1PE.5.7', 12]],
    };
    const refs = rankRelated(file, PASSAGE).targets.map(t => t.ref);
    expect(refs.slice(0, 3)).toEqual(['LUK.12.31', 'PHP.4.6', '1PE.5.7']);
  });

  it('drops targets inside the passage (on screen already) but keeps the same chapter outside it', () => {
    const file: XrefChapter = { 25: [['MAT.6.33', 99], ['MAT.6.30-31', 50], ['MAT.6.19-21', 40], ['MAT.6.24-25', 30]] };
    expect(rankRelated(file, PASSAGE).targets.map(t => t.ref)).toEqual(['MAT.6.19-21']);
  });

  it('drops an overlapping range after a stronger one, and seeds outside the passage add nothing', () => {
    const file: XrefChapter = { 26: [['PSA.147.9', 40], ['PSA.147.8-9', 20], ['PSA.147.10', 5]], 1: [['GEN.1.1', 999]] };
    expect(rankRelated(file, PASSAGE).targets.map(t => t.ref)).toEqual(['PSA.147.9', 'PSA.147.10']);
  });

  it(`keeps at most ${RELATED_PER_BOOK} per book and ${RELATED_VERSES_MAX} in all`, () => {
    const file: XrefChapter = {
      25: [['PSA.1.1', 90], ['PSA.2.1', 80], ['PSA.3.1', 70], ['PRO.1.1', 60], ['PRO.2.1', 50], ['PRO.3.1', 45]],
      26: [['ISA.1.1', 40], ['ISA.2.1', 35], ['JER.1.1', 30], ['LUK.1.1', 25], ['ROM.1.1', 20]],
    };
    const refs = rankRelated(file, PASSAGE).targets.map(t => t.ref);
    // Normalised: seed 25's best (PSA.1.1, 90) and seed 26's best (ISA.1.1, 40) both score 1.0; votes break the tie.
    expect(refs).toEqual(['PSA.1.1', 'ISA.1.1', 'PSA.2.1', 'ISA.2.1', 'JER.1.1', 'PRO.1.1']);
    expect(refs).toHaveLength(RELATED_VERSES_MAX);
  });

  it('puts the focus verse\'s links first, then the rest by votes', () => {
    const file: XrefChapter = { 25: [['LUK.12.22', 300]], 27: [['PSA.39.5', 3]] };
    expect(rankRelated(file, PASSAGE, new Set([27])).targets.map(t => t.ref)).toEqual(['PSA.39.5', 'LUK.12.22']);
  });

  it('reports malformed refs instead of dropping them silently', () => {
    expect(rankRelated({ 25: [['Phil.4.6', 9]] }, PASSAGE)).toEqual({ targets: [], malformed: ['Phil.4.6'] });
  });
});

describe('focusVerses / packPassage', () => {
  it('finds passage verses the question names: the selection question, a typed v., a full ref', () => {
    expect([...focusVerses('「忧虑」在第27节中是什么意思？… in verse 27', PASSAGE)]).toEqual([27]);
    expect([...focusVerses('What about v.33?', PASSAGE)]).toEqual([33]);
    expect([...focusVerses('马太福音 6:26 和 路加福音 12:24', PASSAGE)]).toEqual([26]);
    expect([...focusVerses('第3节 and Matthew 7:1', PASSAGE)]).toEqual([]);
  });

  it('reads the sample pack as 马太福音 6:25–34', () => {
    expect(packPassage(pack)).toEqual(PASSAGE);
  });
});

describe('loadRelatedVerses — the real committed files', () => {
  it('马太福音 6:25–34: six related refs from other passages, 和合本 + BSB text, OpenBible votes, no warnings', async () => {
    stubBundledFetch();
    const { related, warnings } = await loadRelatedVerses(pack, '这段经文怎样帮助我们面对忧虑？');
    expect(warnings).toEqual([]);
    expect(related).toHaveLength(RELATED_VERSES_MAX);
    const refs = related.map(r => r.ref);
    // Per-seed normalisation: before it, raw summed votes gave six links of 6:33 alone
    // (LUK.12.31, MAT.5.6, JHN.6.27, PSA.34.9-10, PSA.84.11-12, MRK.10.29-30).
    expect(refs).toEqual(['PHP.4.6', '1PE.5.7', 'PSA.55.22', 'LUK.12.31', 'MAT.10.29-31', 'LUK.12.25-26']);
    for (const r of related) {
      const t = parseCompactRef(r.ref)!;
      expect(t.bookId === 'MAT' && t.chapter === 6 && t.to >= 25).toBe(false);
      expect(r.verses.length).toBeGreaterThan(0);
      expect(r.verses.length).toBeLessThanOrEqual(RELATED_VERSES_PER_REF);
      expect(r.verses.every(v => v.cuv && v.en)).toBe(true);
      expect(r.label).toMatch(/ · /);
    }
    const perBook = new Map<string, number>();
    for (const r of refs) perBook.set(r.split('.')[0], (perBook.get(r.split('.')[0]) ?? 0) + 1);
    expect(Math.max(...perBook.values())).toBeLessThanOrEqual(RELATED_PER_BOOK);
    expect(lastRelatedVerses()?.related).toEqual(related);
  });

  it('马太福音 6:25–34: the six picks come from at least three different seed verses', () => {
    const file = JSON.parse(readFileSync(path.resolve(__dirname, '../../../public/bible-data/xref/MAT/6.json'), 'utf-8')) as XrefChapter;
    const { targets } = rankRelated(file, PASSAGE);
    expect(targets).toHaveLength(RELATED_VERSES_MAX);
    const firstSeeds = new Set(targets.map(t => t.seeds.reduce((best, s) => {
      const vote = (v: number) => file[String(v)].find(([r]) => r === t.ref)![1] / Math.max(...file[String(v)].map(([, n]) => n));
      return vote(s) > vote(best) ? s : best;
    })));
    expect(firstSeeds.size).toBeGreaterThanOrEqual(3);
    expect(new Set(targets.flatMap(t => t.seeds)).size).toBeGreaterThanOrEqual(3);
  });

  it('loads each chapter file once per session', async () => {
    const fetchMock = stubBundledFetch();
    await loadRelatedVerses(pack, 'q1');
    await loadRelatedVerses(pack, 'q2');
    expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/xref/'))).toHaveLength(1);
  });
});

describe('loadRelatedVerses — failures are reported, the answer goes ahead', () => {
  it('a missing cross-reference file → empty list WITH a warning', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const result = await loadRelatedVerses(pack, 'q');
    expect(result.related).toEqual([]);
    expect(result.warnings).toEqual(['cross-references MAT/6: HTTP 404']);
    expect(lastRelatedVerses()).toEqual(result);
  });

  it('a related verse whose text fails to load is left out with a warning; the rest stay', async () => {
    const real = stubBundledFetch();
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/PHP/4.json') && !String(url).includes('/xref/')
        ? { ok: false, status: 404, json: async () => ({}) }
        : real(url)));
    const { related, warnings } = await loadRelatedVerses(pack, 'q');
    expect(related.map(r => r.ref)).not.toContain('PHP.4.6');
    expect(related).toHaveLength(RELATED_VERSES_MAX - 1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/^related verse text PHP\.4\.6: Bundled chapter unavailable/);
  });

  it('a pack without a book/chapter → a warning, not a fetch', async () => {
    const fetchMock = stubBundledFetch();
    const result = await loadRelatedVerses({ ...pack, passageRef: '箴言 1 · Proverbs 1' }, 'q');
    expect(result).toEqual({ related: [], warnings: ['passage book/chapter unknown: 箴言 1 · Proverbs 1'] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('citedFromMemory (ADR-0015 §5)', () => {
  const related = [{ ref: 'PHP.4.6' }, { ref: '1PE.5.6-7' }];

  it('counts refs in neither the passage nor the related list, each once', () => {
    const answer = '第25节说不要忧虑；腓立比书 4:6 与 彼前5:7 也这样说。Across the whole Bible: Romans 8:28, Romans 8:28, and v.24.';
    expect(citedFromMemory(answer, PASSAGE, related).map(r => r.text)).toEqual(['Romans 8:28', 'v.24']);
  });

  it('a ref only partly covered counts; an unknown "book" (a clock time) never does', () => {
    expect(citedFromMemory('Philippians 4:6-7 at 7:30', PASSAGE, related).map(r => r.text)).toEqual(['Philippians 4:6-7']);
    expect(citedFromMemory('马太福音 6:25–34', PASSAGE, [])).toEqual([]);
  });
});
