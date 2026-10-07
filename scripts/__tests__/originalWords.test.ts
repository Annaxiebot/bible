/**
 * originalWords.test.ts — the STEPBible parsers + the committed original-words files (ADR-0018).
 *
 * Fixture lines copy the real source formats (TAGNT, TAHOT, TBESG, TBESH —
 * header rows, interlinear "#" rows, variant word types, Hebrew prefixes,
 * a Psalm title, an empty Qere). The book pairing is pinned against the
 * app's one book table (services/bibleBookData.ts, R3); the last block reads
 * the generated public/bible-data/orig/ files themselves.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { BIBLE_BOOKS } from '../../services/bibleBookData';
import {
  STEP_BOOK_ORDER, WORD_FIELD_SEPARATOR, stepToAppIds, parseWordRef, isNestleAlandWord, tagntWord, tahotWord,
  hebrewRoot, keptMorph, packWord, addWords, usedStrongIds,
} from '../lib/stepWords.mjs';
import { LEXICON_BRIEF_MAX, parseLexiconLine, plainMeaning, cutBrief, buildLexicon } from '../lib/stepLexicon.mjs';

/** Reads all 1,189 chapter files: fine alone (~2 s), slow when the full suite loads the disk. */
const FILE_SCAN_TIMEOUT_MS = 60_000;
const step = stepToAppIds(BIBLE_BOOKS);
const row = (...cols: string[]) => cols.join('\t');

const TAGNT = [
  'Word & Type\tGreek\tEnglish translation\tdStrongs = Grammar\tDictionary form =  Gloss\teditions',
  '# Jhn.3.16\tοὕτως \tγὰρ \tἠγάπησεν ',
  '#_Translation\tThus\tfor\tloved',
  row('Jhn.3.16#01=NKO', 'οὕτως (houtōs)', 'Thus', 'G3779=ADV', 'οὕτω, οὕτως=thus(-ly)', 'NA28+NA27'),
  row('Jhn.3.16#03=NKO', 'ἠγάπησεν (ēgapēsen)', 'loved', 'G0025=V-AAI-3S', 'ἀγαπάω=to love', 'NA28+NA27'),
  row('Jhn.3.16#07=NKO', 'κόσμον, (kosmon)', 'world,', 'G2889=N-ASM', 'κόσμος=world', 'NA28+NA27'),
  row('Jhn.3.16#11=ko', 'αὐτοῦ (autou)', 'of him', 'G0846=P-GSM', 'αὐτός=he/she/it/self', 'Treg+TR+Byz'),
  row('Jhn.3.17#01=N(k)O', 'οὐ· (ou)', 'not', 'G3756=PRT-N', 'οὐ=not', 'NA28'),
  row('Mrk.16.9#01=KO', '[[Ἀναστὰς (Anastas)', 'Having risen', 'G0450G=V-2AAP-NSM', 'ἀνίστημι=to arise', 'TR+Byz'),
  row('Mrk.16.9#02=O', 'δὴ (dē)', 'indeed', 'G1211=PRT', 'δή=indeed', 'Byz'),
].join('\n');

const TAHOT = [
  'Eng (Heb) Ref & Type\tHebrew\tTransliteration\tTranslation\tdStrongs\tGrammar',
  "# Psa.23.1\tmiz.Mor (מִזְמ֥וֹר)",
  row('Psa.23.0(23.1)#01=L', 'מִזְמ֥וֹר', 'miz.Mor', 'a psalm', '{H4210}', 'HNcmsa'),
  row('Psa.23.1#04=L', 'רֹ֝עִ֗/י', "ro.'/I", '[is] shepherd/ my', '{H7462B}/H9020', 'HVqrmsc/Sp1bs'),
  row('Pro.1.7#01=L', 'יִרְאַ֣ת', "yir.'At", '[the] fear of', '{H3374}', 'HNcfsc'),
  row('Pro.1.7#06=L', 'וּ֝/מוּסָ֗ר', 'u./mu.Sar', 'and/ discipline', 'H9002/{H4148H}', 'HC/Ncmsa'),
  row('Pro.1.7#08=L', 'בָּֽזוּ\\׃\\ \\פ', 'Ba.zu', 'they despise', '{H0936}\\H9016\\ \\H9017', 'HVqp3cp'),
  row('Jdg.16.25#02=Q(K)', '', '[ ]', '[ ]', '', ''),
].join('\n');

describe('STEP book ids → app book ids', () => {
  it('pairs the 66 STEP ids with BIBLE_BOOKS in order (each is the app id in title case)', () => {
    expect(STEP_BOOK_ORDER).toHaveLength(66);
    expect(new Set(STEP_BOOK_ORDER).size).toBe(66);
    for (const [s, id] of step) expect(s.toUpperCase(), s).toBe(id);
    expect(step.get('Ezk')).toBe('EZK');
    expect(step.get('Jhn')).toBe('JHN');
  });

  it('reads word lines only, ignores bracketed alternative versification, throws on an unknown book', () => {
    expect(parseWordRef('# Jhn.3.16\tοὕτως', step)).toBeNull();
    expect(parseWordRef('Word & Type\tGreek', step)).toBeNull();
    expect(parseWordRef('Psa.51.1(51.3)#01=L\tx', step)).toEqual({ book: 'PSA', chapter: 51, verse: 1, type: 'L' });
    expect(parseWordRef('Mat.17.15[17.14]#03=N(k)O\tx', step)).toEqual({ book: 'MAT', chapter: 17, verse: 15, type: 'N(k)O' });
    expect(() => parseWordRef('Tob.1.1#01=L\tx', step)).toThrow(/Unknown STEP book/);
  });
});

describe('word lines → compact words', () => {
  it('Greek: punctuation off the form, translit from the brackets, Strong + morph split, gloss trimmed', () => {
    expect(tagntWord(TAGNT.split('\n')[5].split('\t'))).toEqual(['κόσμον', 'kosmon', 'G2889', 'N-ASM', 'world']);
    expect(() => tagntWord(['Jhn.1.1#01=NKO', 'λόγος', 'word', 'G3056'])).toThrow(/Malformed TAGNT/);
  });

  it('Greek words kept: the Nestlé-Aland text; a verse with none keeps its Traditional-text words', () => {
    expect(['NKO', 'N(k)O', 'no', 'NK(o)'].map(isNestleAlandWord)).toEqual([true, true, true, true]);
    expect(['K', 'ko', 'O', '(k)O'].map(isNestleAlandWord)).toEqual([false, false, false, false]);
    const chapters = new Map<string, Record<string, string[]>>();
    const stats = addWords(TAGNT, 'greek', step, chapters);
    expect(chapters.get('JHN/3')!['16'].map((w: string) => w.split('|')[2])).toEqual(['G3779', 'G0025', 'G2889']);
    expect(chapters.get('JHN/3')!['17']).toEqual(['οὐ|ou|G3756||not']);
    expect(chapters.get('MRK/16')!['9']).toEqual(['Ἀναστὰς|Anastas|G0450G|V-2AAP-NSM|Having risen']);
    expect(stats).toEqual({ words: 5, dropped: 2 });
  });

  it('Hebrew: the root Strong in braces, prefixes and suffixes kept on the word, accents and "/" off, Qere with no word skipped', () => {
    const lines = TAHOT.split('\n');
    expect(tahotWord(lines[3].split('\t'))).toEqual(['רֹעִי', "ro'i", 'H7462B', 'HVqrmsc/Sp1bs', '[is] shepherd/ my']);
    expect(tahotWord(lines[5].split('\t'))).toEqual(['וּמוּסָר', 'umusar', 'H4148H', 'HC/Ncmsa', 'and/ discipline']);
    expect(tahotWord(lines[6].split('\t'))[0]).toBe('בָּזוּ');
    expect(tahotWord(lines[7].split('\t'))).toBeNull();
    expect(hebrewRoot('H9002/{H4148H}')).toBe('H4148H');
    expect(hebrewRoot('H9003/H0776G')).toBe('H0776G');
  });

  it('a Psalm title (verse 0) joins verse 1, as the bundled BSB prints it; the empty Qere is counted as dropped', () => {
    const chapters = new Map<string, Record<string, string[]>>();
    const stats = addWords(TAHOT, 'hebrew', step, chapters);
    expect(chapters.get('PSA/23')!['1']).toEqual(['מִזְמוֹר|mizmor|H4210||a psalm', "רֹעִי|ro'i|H7462B|HVqrmsc/Sp1bs|[is] shepherd/ my"]);
    expect(chapters.get('PRO/1')!['7'][0]).toBe("יִרְאַת|yir'at|H3374||[the] fear of");
    expect(stats).toEqual({ words: 5, dropped: 1 });
    expect([...usedStrongIds(chapters)].sort()).toEqual(['H0936', 'H3374', 'H4148H', 'H4210', 'H7462B']);
  });

  it('morphology is kept for verbs only; the five fields are stored as one "|"-joined string', () => {
    expect(['V-AAI-3S', 'HVqp3cp', 'HC/Vqq3ms', 'N-ASM', 'HNcfsc', 'HC/Ncmsa'].map(keptMorph))
      .toEqual(['V-AAI-3S', 'HVqp3cp', 'HC/Vqq3ms', '', '', '']);
    const packed = packWord(['ἠγάπησεν', 'ēgapēsen', 'G0025', 'V-AAI-3S', 'loved']);
    expect(packed).toBe('ἠγάπησεν|ēgapēsen|G0025|V-AAI-3S|loved');
    expect(WORD_FIELD_SEPARATOR).toBe('|');
    expect(() => packWord(['a|b', 'x', 'G1', '', 'y'])).toThrow(/contains/);
  });
});

const TBESH = [
  'eStrong#\tdStrong\tuStrong\tHebrew\tTransliteration\tMorph\tGloss\tMeaning',
  row('H3374', 'H3374 =', 'H3374', 'יִרְאָה', 'yir.ah', 'H:N-F', 'fear', '1) fear, terror, fearing<br>1a) fear, terror<br>1c) fear (of God), respect, reverence, piety'),
  row('H4148', 'H4148H = a Meaning of', 'H4148G', 'מוּסָר', 'mu.sar', 'H:N-M', 'discipline: instruction', ': instruction<br>1) discipline, chastening, correction'),
].join('\n');
const TBESG = row('G2889', 'G2889 =', 'G2889', 'κόσμος', 'kosmos', 'G:N-M', 'world',
  " <b>κόσμος</b>, -ου, ὁ <BR /> [in LXX: <ref='Gen.2.1'>Gen.2:1</ref> ;] <BR /> __1. <b>order</b> (Hom., Plat., al.). <BR /> __2. <b>ornament</b>: <ref='1Pe.3.3'>1Pe.3:3.</ref>");

describe('brief lexicons', () => {
  it('parses entry lines only, keyed by the disambiguated id', () => {
    expect(parseLexiconLine(TBESH.split('\n')[0])).toBeNull();
    expect(parseLexiconLine(TBESH.split('\n')[2])).toMatchObject({ eStrong: 'H4148', id: 'H4148H', lemma: 'מוּסָר', translit: 'musar' });
  });

  it('Hebrew: BDB outline joined with "; "; Greek: no lemma line, no LXX note, no references, no apparatus', () => {
    expect(plainMeaning('1) fear<br>1a) terror', 'hebrew')).toBe('1) fear; 1a) terror');
    expect(plainMeaning(parseLexiconLine(TBESG)!.meaning, 'greek')).toBe('1. order. 2. ornament:');
  });

  it('builds [lemma, translit, "gloss: meaning"], says a repeated gloss once, falls back to the plain number, reports misses', () => {
    const { lexicon, missing } = buildLexicon(TBESH, 'hebrew', ['H3374', 'H4148H', 'H4148', 'H9999']);
    expect(lexicon.H3374).toEqual(['יִרְאָה', 'yirah', 'fear: 1) fear, terror, fearing; 1a) fear, terror; 1c) fear (of God), respect, reverence, piety']);
    expect(lexicon.H4148H[2]).toBe('discipline: instruction; 1) discipline, chastening, correction');
    expect(lexicon.H4148).toEqual(lexicon.H4148H);
    expect(missing).toEqual(['H9999']);
  });

  it('cuts a long meaning at a boundary within LEXICON_BRIEF_MAX, ending with …', () => {
    const long = Array.from({ length: 40 }, (_, i) => `${i}) sense number ${i}`).join('; ');
    const cut = cutBrief(long);
    expect(cut.length).toBeLessThanOrEqual(LEXICON_BRIEF_MAX);
    expect(cut.endsWith(';…') || cut.endsWith('…')).toBe(true);
    expect(cutBrief('short')).toBe('short');
  });
});

/** A stored word's fields (the app's originalWords.unpackWord reads the same shape; pinned in its test). */
function fieldsOf(stored: string) {
  const [original, translit, strong, morph, gloss] = stored.split(WORD_FIELD_SEPARATOR);
  return { original, translit, strong, morph, gloss };
}

describe('the committed public/bible-data/orig files', () => {
  const ROOT = path.resolve(__dirname, '../../public/bible-data/orig');
  const chapter = (book: string, ch: number) => JSON.parse(readFileSync(path.join(ROOT, book, `${ch}.json`), 'utf-8')) as Record<string, string[]>;
  const lexicon = (lang: string) => JSON.parse(readFileSync(path.join(ROOT, `lexicon-${lang}.json`), 'utf-8')) as Record<string, string[]>;

  it('John 3:16 has κόσμον (kosmon, G2889); Proverbs 1:7 has yir\'at (H3374); Psalm 23:1 has the shepherd (H7462B)', () => {
    expect(chapter('JHN', 3)['16'].map(fieldsOf)).toContainEqual({ original: 'κόσμον', translit: 'kosmon', strong: 'G2889', morph: '', gloss: 'world' });
    expect(chapter('PRO', 1)['7'].map(fieldsOf)[0]).toMatchObject({ translit: "yir'at", strong: 'H3374' });
    expect(chapter('PSA', 23)['1'].map(w => fieldsOf(w).strong)).toContain('H7462B');
    expect(lexicon('greek').G2889.slice(0, 2)).toEqual(['κόσμος', 'kosmos']);
    expect(lexicon('hebrew').H3374[2]).toMatch(/^fear: 1\) fear/);
  });

  it('cover every chapter of the book table; every word has five fields and a lexicon entry; briefs fit the budget', () => {
    const lex = { G: lexicon('greek'), H: lexicon('hebrew') };
    let words = 0;
    for (const book of BIBLE_BOOKS) {
      for (let ch = 1; ch <= book.chapters; ch++) {
        expect(existsSync(path.join(ROOT, book.id, `${ch}.json`)), `${book.id} ${ch}`).toBe(true);
        for (const list of Object.values(chapter(book.id, ch))) {
          for (const stored of list) {
            const fields = stored.split('|');
            if (fields.length !== 5 || !lex[fields[2][0] as 'G' | 'H'][fields[2]]) throw new Error(`${book.id} ${ch}: ${stored}`);
            words++;
          }
        }
      }
    }
    expect(words).toBeGreaterThan(440_000);
    for (const entry of [...Object.values(lex.G), ...Object.values(lex.H)]) expect(entry[2].length).toBeLessThanOrEqual(LEXICON_BRIEF_MAX);
  }, FILE_SCAN_TIMEOUT_MS);
});
