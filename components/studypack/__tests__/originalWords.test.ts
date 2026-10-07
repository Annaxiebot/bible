/**
 * originalWords.test.ts — which verses a question is about, loading their words, the block (ADR-0018)
 *
 * Loads the REAL committed public/bible-data/orig files (stubBundledFetch):
 * no hand-written word list that could agree with a wrong loader (R14).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { parseStudyPack } from '../packTypes';
import { questionForSelection } from '../askAI';
import {
  ORIGINAL_WORDS_ENABLED, ORIGINAL_WORDS_MAX_VERSES, clearOriginalWordsCache, lastOriginalWords, loadOriginalWords,
  selectionOf, targetVerses, unpackWord, withLexicon,
} from '../originalWords';
import { ORIGINAL_WORDS_HEADING, formatOriginalWordsBlock } from '../../../supabase/functions/_shared/aiPrompts';
import { TEST_PACK_PATH } from './fixtures';
import { stubBundledFetch } from './bundledFetch';
import { packWord } from '../../../scripts/lib/stepWords.mjs';

const matt6 = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));

/** A minimal pack over bundled chapter text (the shape scripts/lib/evalAppModules buildPack writes). */
function packOf(bookId: string, chapter: number, from: number, to: number, passageRef: string) {
  const cuv = JSON.parse(readFileSync(`public/bible-data/cuv/${bookId}/${chapter}.json`, 'utf-8')).verses as Array<{ verse: number; text: string }>;
  const bsb = JSON.parse(readFileSync(`public/bible-data/bsb/${bookId}/${chapter}.json`, 'utf-8')).verses as Array<{ verse: number; text: string }>;
  const verses = cuv.filter(v => v.verse >= from && v.verse <= to)
    .map(v => ({ num: v.verse, cuv: v.text, en: bsb.find(b => b.verse === v.verse)!.text }));
  return parseStudyPack({
    id: `t-${bookId}`, title: 't', date: '2026-10-06', passageRef, enVersion: 'BSB',
    sections: [{ kind: 'title', heading: 't' }, { kind: 'scripture', heading: 's', verses }],
  });
}
const john3 = packOf('JHN', 3, 16, 21, '约翰福音 3:16–21 · John 3:16–21');
const prov1 = packOf('PRO', 1, 1, 19, '箴言 1:1–19 · Proverbs 1:1–19');

beforeEach(() => {
  vi.unstubAllGlobals();
  clearOriginalWordsCache();
});

describe('targetVerses (pure)', () => {
  it('is on since the evaluation (ADR-0018), at most 2 verses', () => {
    expect(ORIGINAL_WORDS_ENABLED).toBe(true);
    expect(ORIGINAL_WORDS_MAX_VERSES).toBe(2);
  });

  it('a selection question with its verse → that verse', () => {
    expect(targetVerses(matt6, questionForSelection('忧虑', 34))).toEqual([34]);
    expect(targetVerses(john3, questionForSelection('世人', 16))).toEqual([16]);
  });

  it('a question naming verses → those passage verses, at most two', () => {
    expect(targetVerses(matt6, '第27节是什么意思？')).toEqual([27]);
    expect(targetVerses(matt6, 'In v.26, what does "barns" mean?')).toEqual([26]);
    expect(targetVerses(matt6, 'What does verse 33 say?')).toEqual([33]);
    expect(targetVerses(matt6, '第25至34节的主题是什么？')).toEqual([25, 26]);
    expect(targetVerses(matt6, '第3节是什么意思？')).toEqual([]); // not in the passage
  });

  it('a selection with no verse → the passage verses whose text contains it', () => {
    expect(selectionOf(questionForSelection('明天'))).toBe('明天');
    expect(targetVerses(matt6, questionForSelection('明天'))).toEqual([30, 34]);
    expect(targetVerses(john3, questionForSelection('the world'))).toEqual([16, 17]);
  });

  it('a general question → none (no fetch, no block, today\'s request)', () => {
    expect(targetVerses(matt6, 'What does the whole Bible say about worry?')).toEqual([]);
    expect(targetVerses(matt6, '忧虑和信心有什么关系？')).toEqual([]);
  });
});

describe('the stored word format', () => {
  it('unpackWord reads what the build script\'s packWord writes', () => {
    const packed = packWord(['ἠγάπησεν', 'ēgapēsen', 'G0025', 'V-AAI-3S', 'loved']);
    expect(unpackWord(packed)).toEqual({ original: 'ἠγάπησεν', translit: 'ēgapēsen', strong: 'G0025', morph: 'V-AAI-3S', gloss: 'loved' });
    expect(unpackWord(packWord(['κόσμον', 'kosmon', 'G2889', 'N-ASM', 'world']))).toMatchObject({ morph: '', gloss: 'world' });
  });
});

describe('loadOriginalWords (real files)', () => {
  it('John 3:16: Greek words in order with lexicon entries; the lexicon loads once per session', async () => {
    const fetchMock = stubBundledFetch();
    const result = await loadOriginalWords(john3, questionForSelection('世人', 16));
    expect(result.warnings).toEqual([]);
    expect(result.verses).toHaveLength(1);
    const verse = result.verses[0];
    expect(verse.label).toBe('约翰福音 3:16 · John 3:16');
    expect(verse.language).toBe('Greek');
    expect(verse.words[0]).toMatchObject({ original: 'οὕτως', strong: 'G3779' });
    expect(verse.words.find(w => w.strong === 'G2889')).toMatchObject({ translit: 'kosmon', gloss: 'world', lemma: 'κόσμος', lemmaTranslit: 'kosmos' });
    await loadOriginalWords(john3, '第17节是什么意思？');
    const lexiconCalls = fetchMock.mock.calls.filter(c => String(c[0]).includes('lexicon-greek.json'));
    expect(lexiconCalls).toHaveLength(1);
    expect(lastOriginalWords()?.targets).toEqual([17]);
  });

  it('Proverbs 1:7: Hebrew, yir\'at = H3374 with its BDB meaning; prefixes stay on their word', async () => {
    stubBundledFetch();
    const { verses, warnings } = await loadOriginalWords(prov1, questionForSelection('敬畏耶和华', 7));
    expect(warnings).toEqual([]);
    expect(verses[0].language).toBe('Hebrew');
    expect(verses[0].words[0]).toMatchObject({ translit: "yir'at", strong: 'H3374', lemma: 'יִרְאָה' });
    expect(verses[0].words[0].brief).toMatch(/^fear: 1\) fear/);
    expect(verses[0].words.find(w => w.strong === 'H4148H')).toMatchObject({ original: 'וּמוּסָר', gloss: 'and/ discipline' });
  });

  it('a general question fetches nothing', async () => {
    const fetchMock = stubBundledFetch();
    expect(await loadOriginalWords(matt6, 'What does the whole Bible say about worry?')).toEqual({ verses: [], targets: [], warnings: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a failed chapter load → no words + a warning; a failed lexicon → words without meanings + a warning (never silent)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    const failed = await loadOriginalWords(matt6, '第27节是什么意思？');
    expect(failed.verses).toEqual([]);
    expect(failed.warnings).toEqual(['original words MAT/6: HTTP 404']);
    const files = stubBundledFetch();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.includes('lexicon') ? { ok: false, status: 500, json: async () => ({}) } : files(url))));
    const noLexicon = await loadOriginalWords(matt6, '第27节是什么意思？');
    expect(noLexicon.verses[0].words.length).toBeGreaterThan(5);
    expect(noLexicon.verses[0].words.every(w => w.brief === undefined)).toBe(true);
    expect(noLexicon.warnings).toEqual(['lexicon-greek: HTTP 500 — words sent without lexicon meanings']);
  });

  it('withLexicon reports an id the lexicon lacks and keeps the word', () => {
    const warnings: string[] = [];
    const words = withLexicon([unpackWord('x|x|G9999||x')], {}, warnings);
    expect(words[0].brief).toBeUndefined();
    expect(warnings).toEqual(['no lexicon entry for G9999']);
  });
});

describe('formatOriginalWordsBlock (the shared builder)', () => {
  it('none → empty (no block); per verse a label line, then one line per word, the lexicon meaning once per Strong\'s number', async () => {
    expect(formatOriginalWordsBlock([])).toBe('');
    stubBundledFetch();
    const { verses } = await loadOriginalWords(john3, questionForSelection('世人', 16));
    const block = formatOriginalWordsBlock(verses);
    const lines = block.split('\n');
    expect(lines[0].startsWith(`${ORIGINAL_WORDS_HEADING} (STEP Bible`)).toBe(true);
    expect(lines[1]).toBe('[约翰福音 3:16 · John 3:16 · Greek]');
    expect(lines).toContain('ēgapēsen (ἠγάπησεν) · G0025 · V-AAI-3S · loved — ἀγαπάω (agapaō): ' + verses[0].words[2].brief);
    const kosmon = lines.find(l => l.startsWith('kosmon (κόσμον) · G2889 · world — κόσμος (kosmos): world'));
    expect(kosmon).toBeDefined();
    const articles = lines.filter(l => / · G3588 · /.test(l));
    expect(articles.length).toBeGreaterThan(2);
    expect(articles.filter(l => l.includes(' — ')).length).toBe(1);
  });
});
