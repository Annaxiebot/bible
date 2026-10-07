import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  parseStudyPack,
  buildSlides,
  chunkVerses,
  getPackIdFromHash,
  packContentLanguage,
  StudyPack,
  PackVerse,
  MAX_VERSES_PER_SLIDE,
  LEGACY_PACK_KEYS,
} from '../packTypes';
import {
  MAX_BODY_LINES_PER_SLIDE, MAX_LIFE_MENU_ROWS_PER_SLIDE, VERSE_LINE_EMS, estimateBodyLines,
} from '../slideFit';
import { CONTENT_LANGUAGES, LEGACY_CONTENT_LANGUAGE } from '../principles';
import { TEST_PACK_PATH } from './fixtures';
import { currentSignupUrl } from '../../signup/signupRoute';


function loadRealPack(): StudyPack {
  return parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
}

describe('parseStudyPack', () => {
  it('accepts an old pack carrying Google Forms keys (removed 2026-10-05) and drops them; its slides link no form', () => {
    const raw = { ...loadRealPack(), feedbackFormUrl: 'https://docs.google.com/forms/d/e/old/viewform', feedbackFormEntries: { name: 'bad id' } };
    const pack = parseStudyPack(raw);
    expect([...LEGACY_PACK_KEYS]).toEqual(['feedbackFormUrl', 'feedbackFormEntries']);
    for (const key of LEGACY_PACK_KEYS) expect(Object.keys(pack)).not.toContain(key);
    expect(buildSlides(pack).length).toBeGreaterThan(0);
    expect(JSON.stringify(buildSlides(pack))).not.toContain('docs.google.com');
  });


  it('parses the shipped 2026-10-02-matt6 pack', () => {
    const pack = loadRealPack();
    expect(pack.id).toBe('2026-10-02-matt6');
    expect(pack.title).toContain('不要忧虑');
    const scripture = pack.sections.find(s => s.kind === 'scripture')!;
    expect(scripture.verses).toHaveLength(10);
    expect(scripture.verses!.map(v => v.num)).toEqual([25, 26, 27, 28, 29, 30, 31, 32, 33, 34]);
    expect(scripture.verses![0].cuv).toContain('忧虑');
    expect(scripture.verses![0].en).toContain('do not worry');  // BSB, not WEB
    expect(pack.sections.map(s => s.kind)).toEqual([
      'title', 'scripture', 'context', 'originalLanguage', 'crossRefs',
      'discussion', 'lifeMenu', 'reflection', 'qr', 'closing',
    ]);
  });

  it('rejects non-object input', () => {
    expect(() => parseStudyPack(null)).toThrow('not an object');
    expect(() => parseStudyPack('x')).toThrow('not an object');
  });

  it('rejects a pack missing required string fields', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    delete pack.passageRef;
    expect(() => parseStudyPack(pack)).toThrow('passageRef');
  });

  it('rejects a pack missing the enVersion label', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    delete pack.enVersion;
    expect(() => parseStudyPack(pack)).toThrow('enVersion');
  });

  it('rejects empty or missing sections', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    pack.sections = [];
    expect(() => parseStudyPack(pack)).toThrow('non-empty sections');
  });

  it('rejects a section with an unknown kind', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    pack.sections[0].kind = 'karaoke';
    expect(() => parseStudyPack(pack)).toThrow('unknown kind: karaoke');
  });

  it('rejects a discussion section without questions', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    const discussion = pack.sections.find((s: { kind: string }) => s.kind === 'discussion');
    discussion.questions = [];
    expect(() => parseStudyPack(pack)).toThrow('questions[]');
  });

  it('rejects a lifeMenu section with malformed rows', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    const lifeMenu = pack.sections.find((s: { kind: string }) => s.kind === 'lifeMenu');
    lifeMenu.rows = [{ area: 'Health' }];
    expect(() => parseStudyPack(pack)).toThrow('rows[]');
  });

  it('rejects a scripture section without embedded verses', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    const scripture = pack.sections.find((s: { kind: string }) => s.kind === 'scripture');
    delete scripture.verses;
    expect(() => parseStudyPack(pack)).toThrow('verses[]');
  });

  it('contentLanguage is optional (legacy packs read as bilingual) and must be a known mode when present', () => {
    const pack = loadRealPack();
    expect(pack.contentLanguage).toBeUndefined();
    expect(packContentLanguage(pack)).toBe(LEGACY_CONTENT_LANGUAGE);
    expect(LEGACY_CONTENT_LANGUAGE).toBe('bilingual');
    for (const mode of CONTENT_LANGUAGES) {
      expect(parseStudyPack({ ...pack, contentLanguage: mode }).contentLanguage).toBe(mode);
      expect(packContentLanguage({ contentLanguage: mode })).toBe(mode);
    }
    expect(() => parseStudyPack({ ...pack, contentLanguage: 'klingon' })).toThrow('contentLanguage');
    expect(() => parseStudyPack({ ...pack, contentLanguage: 1 })).toThrow('contentLanguage');
  });

  it('leaderId is optional but must be a non-empty string when present', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    expect(parseStudyPack({ ...pack, leaderId: 'uid-lead' }).leaderId).toBe('uid-lead');
    expect(() => parseStudyPack({ ...pack, leaderId: '' })).toThrow('leaderId');
    expect(() => parseStudyPack({ ...pack, leaderId: 7 })).toThrow('leaderId');
  });

  it('a qr section needs no image or url (the QR is drawn per pack); a legacy image must be a string', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    const qr = pack.sections.find((s: { kind: string }) => s.kind === 'qr');
    expect(qr.image).toBeUndefined();
    expect(qr.url).toBeUndefined();
    expect(() => parseStudyPack(pack)).not.toThrow();
    qr.image = 'packs/legacy.png';
    expect(() => parseStudyPack(pack)).not.toThrow();
    qr.image = 42;
    expect(() => parseStudyPack(pack)).toThrow('legacy image');
  });

  it('a study-guide pack\'s section origin (guide | ai) and notVerbatim lines parse; anything else is refused (ADR-0019)', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    const discussion = pack.sections.find((s: { kind: string }) => s.kind === 'discussion');
    Object.assign(discussion, { origin: 'guide', notVerbatim: [discussion.questions[0]] });
    expect(parseStudyPack(pack).sections.find(s => s.kind === 'discussion')).toMatchObject({ origin: 'guide' });
    expect(buildSlides(parseStudyPack(pack))).toEqual(buildSlides(loadRealPack())); // the TV ignores both
    discussion.origin = 'pdf';
    expect(() => parseStudyPack(pack)).toThrow('origin must be guide | ai');
    Object.assign(discussion, { origin: 'ai', notVerbatim: 'one line' });
    expect(() => parseStudyPack(pack)).toThrow('notVerbatim must be a string[]');
  });

  it('rejects scripture verses missing a translation', () => {
    const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    const scripture = pack.sections.find((s: { kind: string }) => s.kind === 'scripture');
    scripture.verses = [{ num: 25, cuv: '文' }];
    expect(() => parseStudyPack(pack)).toThrow('verses[]');
  });
});

describe('chunkVerses', () => {
  const mk = (n: number): PackVerse[] =>
    Array.from({ length: n }, (_, i) => ({ num: i + 1, cuv: `c${i}`, en: `e${i}` }));

  it('splits 10 short verses into 2/2/3/3 (at most MAX_VERSES_PER_SLIDE each)', () => {
    expect(MAX_VERSES_PER_SLIDE).toBe(3);
    expect(chunkVerses(mk(10)).map(c => c.length)).toEqual([2, 2, 3, 3]);
  });

  it('keeps short passages on one slide and splits evenly otherwise', () => {
    expect(chunkVerses(mk(3)).map(c => c.length)).toEqual([3]);
    expect(chunkVerses(mk(4)).map(c => c.length)).toEqual([2, 2]);
    expect(chunkVerses(mk(5)).map(c => c.length)).toEqual([2, 3]);
    expect(chunkVerses(mk(8)).map(c => c.length)).toEqual([2, 3, 3]);
  });

  it('preserves order and loses no verses', () => {
    const flat = chunkVerses(mk(10)).flat();
    expect(flat.map(v => v.num)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  it('long verses split sooner: no part passes MAX_VERSE_ROWS_PER_SLIDE estimated rows', () => {
    const long = (num: number): PackVerse => ({ num, cuv: '字'.repeat(VERSE_LINE_EMS * 4), en: 'e' });
    const parts = chunkVerses([long(1), long(2), long(3)]);
    expect(parts.map(p => p.length)).toEqual([1, 2]);
  });

  it('the key phrase takes room from part 1 only', () => {
    const rows3 = (num: number): PackVerse => ({ num, cuv: '字'.repeat(VERSE_LINE_EMS * 3), en: 'e' });
    const verses = [rows3(1), rows3(2), rows3(3)];
    expect(chunkVerses(verses).map(p => p.length)).toEqual([3]);
    expect(chunkVerses(verses, '「不要忧虑」 “Do not worry” (v.1)').map(p => p.length)).toEqual([1, 2]);
  });
});

describe('buildSlides', () => {
  const DEMO_SLIDE_COUNT = 23;

  it('splits scripture into parts that fit, keyPhrase on part 1, emphasis on every part', () => {
    const slides = buildSlides(loadRealPack());
    const scripture = slides.filter(s => s.kind === 'scripture');
    expect(scripture.map(s => s.verses!.map(v => v.num))).toEqual([
      [25], [26, 27], [28, 29], [30, 31], [32, 33, 34],
    ]);
    expect(scripture.map(s => s.partIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(scripture.every(s => s.partTotal === 5)).toBe(true);
    expect(scripture[0].keyPhrase).toContain('不要为生命忧虑');
    expect(scripture[1].keyPhrase).toBeUndefined();
    expect(scripture.every(s => s.emphasis === scripture[0].keyPhrase)).toBe(true);
  });

  it(`pins the demo pack at ${DEMO_SLIDE_COUNT} slides; discussion is one slide per question`, () => {
    const slides = buildSlides(loadRealPack());
    expect(slides).toHaveLength(DEMO_SLIDE_COUNT);
    const discussion = slides.filter(s => s.kind === 'discussion');
    expect(discussion).toHaveLength(5);
    expect(discussion[0].questionNumber).toBe(1);
    expect(discussion[4].questionNumber).toBe(5);
    expect(discussion.every(s => s.questionTotal === 5)).toBe(true);
    expect(discussion.every(s => s.partTotal === undefined)).toBe(true);
    expect(discussion[2].question).toContain('pulled apart, divided');
  });

  it('caps body text per slide and numbers continuation slides', () => {
    const slides = buildSlides(loadRealPack());
    for (const s of slides.filter(x => x.body && x.kind !== 'title')) {
      const rows = s.body!.reduce((sum, line) => sum + estimateBodyLines(line), 0);
      expect(rows, s.heading).toBeLessThanOrEqual(MAX_BODY_LINES_PER_SLIDE);
    }
    const context = slides.filter(s => s.kind === 'context');
    expect(context.map(s => [s.partIndex, s.partTotal])).toEqual([[1, 2], [2, 2]]);
    expect(context.every(s => s.heading === '背景 Context')).toBe(true);
    // a section that fits keeps one slide with no counter
    const closing = slides.filter(s => s.kind === 'closing');
    expect(closing).toHaveLength(1);
    expect(closing[0].partTotal).toBeUndefined();
  });

  it('loses no content: each section\'s continuation slides concatenate back to its body / rows', () => {
    const pack = loadRealPack();
    const slides = buildSlides(pack);
    for (const section of pack.sections) {
      const own = slides.filter(s => s.kind === section.kind);
      if (section.body && section.kind !== 'qr') expect(own.flatMap(s => s.body ?? [])).toEqual(section.body);
      if (section.rows) expect(own.flatMap(s => s.rows ?? [])).toEqual(section.rows);
      if (section.verses) expect(own.flatMap(s => s.verses ?? [])).toEqual(section.verses);
    }
  });

  it('splits the 7-row life menu over two slides (it overflows 1280×720 on one)', () => {
    const slides = buildSlides(loadRealPack());
    const lifeMenu = slides.filter(s => s.kind === 'lifeMenu');
    expect(lifeMenu.map(s => s.rows!.length)).toEqual([3, 4]);
    expect(lifeMenu.every(s => s.rows!.length <= MAX_LIFE_MENU_ROWS_PER_SLIDE)).toBe(true);
    expect(lifeMenu.map(s => s.partIndex)).toEqual([1, 2]);
  });

  it('carries the qr section through to a slide between reflection and closing', () => {
    const demo = loadRealPack();
    expect(demo.leaderId).toBeUndefined();  // the committed sample pack is demo-only (ADR-0004)
    const demoSlides = buildSlides(demo);
    const qrIndex = demoSlides.findIndex(s => s.kind === 'qr');
    expect(qrIndex).toBe(DEMO_SLIDE_COUNT - 2); // second to last, before closing
    expect(demoSlides[qrIndex - 1].kind).toBe('reflection');
    expect(demoSlides[qrIndex].signupUrl).toBeUndefined();
    expect(demoSlides[qrIndex].heading).toBe('签到 Sign up');
    expect(demoSlides[qrIndex + 1].kind).toBe('closing');
    const owned = parseStudyPack({ ...demo, leaderId: 'uid-lead' });
    const ownedQr = buildSlides(owned)[qrIndex];
    expect(ownedQr.signupUrl).toBe(currentSignupUrl(owned.id));
    expect(ownedQr.signupUrl).toMatch(/#\/signup\/2026-10-02-matt6$/);
  });
});

describe('getPackIdFromHash', () => {
  it('extracts the pack id from the TV route', () => {
    expect(getPackIdFromHash('#/pack/2026-10-02-matt6')).toBe('2026-10-02-matt6');
  });

  it('ignores a query after the id (#/pack/<id>?x=1)', () => {
    expect(getPackIdFromHash('#/pack/local-2026-10-02-pro1?x=1')).toBe('local-2026-10-02-pro1');
    expect(getPackIdFromHash('#/pack/?x=1')).toBeNull();
    expect(getPackIdFromHash('#/pack/a/b?x=1')).toBeNull();
  });

  it('returns null for non-pack hashes', () => {
    expect(getPackIdFromHash('')).toBeNull();
    expect(getPackIdFromHash('#/')).toBeNull();
    expect(getPackIdFromHash('#/pack/')).toBeNull();
    expect(getPackIdFromHash('#/pack/a/b')).toBeNull();
    expect(getPackIdFromHash('#/other/2026-10-02-matt6')).toBeNull();
  });

  it('rejects ids with path-escaping characters', () => {
    expect(getPackIdFromHash('#/pack/../secret')).toBeNull();
    expect(getPackIdFromHash('#/pack/a%2Fb')).toBeNull();
  });
});
