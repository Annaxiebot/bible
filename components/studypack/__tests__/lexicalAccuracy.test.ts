/**
 * lexicalAccuracy.test.ts — the answer's Greek/Hebrew forms vs the verse's data (ADR-0018 §5)
 *
 * The word lists come from the REAL committed files via the app's loader
 * (John 3:16, Proverbs 1:7), so the checker is tested against what the
 * evaluation will measure with.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { parseStudyPack } from '../packTypes';
import { questionForSelection } from '../askAI';
import { clearOriginalWordsCache, loadOriginalWords } from '../originalWords';
import { checkLexicalAccuracy, normaliseScript, normaliseStrong, normaliseTranslit } from '../lexicalAccuracy';
import type { OriginalWord } from '../../../supabase/functions/_shared/aiPrompts';
import { stubBundledFetch } from './bundledFetch';

function packOf(bookId: string, chapter: number, verse: number, passageRef: string) {
  const text = (t: string) => (JSON.parse(readFileSync(`public/bible-data/${t}/${bookId}/${chapter}.json`, 'utf-8')).verses as Array<{ verse: number; text: string }>)
    .find(v => v.verse === verse)!.text;
  return parseStudyPack({
    id: 't', title: 't', date: '2026-10-06', passageRef, enVersion: 'BSB',
    sections: [{ kind: 'title', heading: 't' }, { kind: 'scripture', heading: 's', verses: [{ num: verse, cuv: text('cuv'), en: text('bsb') }] }],
  });
}

let john316: OriginalWord[] = [];
let prov17: OriginalWord[] = [];
beforeAll(async () => {
  clearOriginalWordsCache();
  stubBundledFetch();
  john316 = [...(await loadOriginalWords(packOf('JHN', 3, 16, '约翰福音 3:16 · John 3:16'), questionForSelection('世人', 16))).verses[0].words];
  prov17 = [...(await loadOriginalWords(packOf('PRO', 1, 7, '箴言 1:7 · Proverbs 1:7'), questionForSelection('敬畏', 7))).verses[0].words];
  vi.unstubAllGlobals();
});

describe('normalisers', () => {
  it('ignore accents, breathings, vowel points, case and final sigma; translit keeps letters only', () => {
    expect(normaliseScript('Κόσμος')).toBe(normaliseScript('κοσμοσ'));
    expect(normaliseScript('יִרְאַת')).toBe('יראת');
    expect(normaliseTranslit("yir'At")).toBe('yirat');
    expect(normaliseTranslit('kósmos')).toBe('kosmos');
    expect(normaliseStrong('g02889')).toBe('G2889');
    expect(normaliseStrong('H4148h')).toBe('H4148H');
  });
});

describe('checkLexicalAccuracy', () => {
  it('a faithful Chinese answer: the verse form, the lemma, the transliteration and the Strong\'s number are all found', () => {
    const answer = '这里的「世人」原文是希腊文 κόσμον（kosmon，原形 κόσμος kosmos，Strong\'s G2889），指整个人类世界（world）。';
    const r = checkLexicalAccuracy(answer, john316);
    expect(r.mentions.map(m => [m.kind, m.form, m.found])).toEqual([
      ['greek', 'κόσμον', true], ['greek', 'κόσμος', true], ['strong', 'G2889', true],
      ['translit', 'kosmon', true], ['translit', 'kosmos', true],
    ]);
    expect([r.found, r.total]).toEqual([5, 5]);
  });

  it('ordinary English is not counted as a wrong transliteration (regression: the ADR-0018 run flagged these)', () => {
    const answer = "The Greek word Jesus uses here isn't rare; broadly, the transliteration kosmos (κόσμος) means world. "
      + 'The Hebrew knowledge of God is different.';
    const forms = checkLexicalAccuracy(answer, john316).mentions.map(m => m.form);
    for (const english of ["isn't", 'Jesus', 'broadly', 'transliteration', 'knowledge']) expect(forms).not.toContain(english);
    expect(forms).toEqual(expect.arrayContaining(['κόσμος', 'kosmos']));
  });

  it('a made-up transliteration with a mark is still caught as not found', () => {
    const r = checkLexicalAccuracy('原文是希腊文 systenazō（同叹息）。', john316);
    expect(r.mentions).toEqual([{ form: 'systenazō', kind: 'translit', found: false }]);
  });

  it('a form or number the verse does not have is reported as not found', () => {
    const answer = 'The Greek word aiōn (αἰών, G0165) means an age; the Hebrew is olam.';
    const r = checkLexicalAccuracy(answer, john316);
    expect(r.mentions.filter(m => !m.found).map(m => m.form)).toEqual(['αἰών', 'G0165', 'aiōn', 'olam']);
    expect(r.found).toBe(0);
  });

  it('Hebrew: pointed or unpointed, with or without the prefix, against the word and its lemma', () => {
    const answer = '「敬畏」的希伯来文是 יִרְאַת (yir\'at)，词典形式 יראה (yirah, H3374)；不是 פחד (pachad)。';
    const r = checkLexicalAccuracy(answer, prov17);
    expect(r.mentions.map(m => [m.form, m.found])).toEqual([
      ['יִרְאַת', true], ['יראה', true], ['פחד', false], ['H3374', true], ["yir'at", true], ['yirah', true], ['pachad', false],
    ]);
  });

  it('ordinary English is not taken for a transliteration ("to", "men", "the Greek word for world")', () => {
    const answer = 'God gave His Son to all men; the Greek word for world here is plain.';
    expect(checkLexicalAccuracy(answer, john316).mentions).toEqual([]);
  });

  it('an answer with no original-language forms has nothing to check', () => {
    expect(checkLexicalAccuracy('神爱世人，甚至将他的独生子赐给他们。', john316)).toEqual({ mentions: [], found: 0, total: 0 });
  });
});
