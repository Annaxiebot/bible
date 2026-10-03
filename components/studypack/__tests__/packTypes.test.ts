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
} from '../packTypes';
import { CONTENT_LANGUAGES, LEGACY_CONTENT_LANGUAGE } from '../principles';
import { TEST_PACK_PATH } from './fixtures';
import { currentSignupUrl } from '../../signup/signupRoute';


function loadRealPack(): StudyPack {
  return parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
}

describe('parseStudyPack', () => {
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

  it('splits 10 verses into 2/2/3/3 (the Matt 6:25-34 case, cap 3)', () => {
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
});

describe('buildSlides', () => {
  it('splits scripture into parts with indicators, keyPhrase only on part 1', () => {
    const slides = buildSlides(loadRealPack());
    const scripture = slides.filter(s => s.kind === 'scripture');
    expect(scripture).toHaveLength(4);
    expect(scripture.map(s => s.verses!.map(v => v.num))).toEqual([
      [25, 26], [27, 28], [29, 30, 31], [32, 33, 34],
    ]);
    expect(scripture.map(s => s.partIndex)).toEqual([1, 2, 3, 4]);
    expect(scripture.every(s => s.partTotal === 4)).toBe(true);
    expect(scripture[0].keyPhrase).toContain('不要为生命忧虑');
    expect(scripture[1].keyPhrase).toBeUndefined();
  });

  it('expands discussion questions into one slide each (17 total)', () => {
    const slides = buildSlides(loadRealPack());
    expect(slides).toHaveLength(17);
    const discussion = slides.filter(s => s.kind === 'discussion');
    expect(discussion).toHaveLength(5);
    expect(discussion[0].questionNumber).toBe(1);
    expect(discussion[4].questionNumber).toBe(5);
    expect(discussion.every(s => s.questionTotal === 5)).toBe(true);
    expect(discussion[2].question).toContain('pulled apart, divided');
  });

  it('carries the qr section through to a slide between reflection and closing', () => {
    const demo = loadRealPack();
    expect(demo.leaderId).toBeUndefined();  // the committed sample pack is demo-only (ADR-0004)
    const demoSlides = buildSlides(demo);
    const qrIndex = demoSlides.findIndex(s => s.kind === 'qr');
    expect(qrIndex).toBe(15); // second to last, before closing
    expect(demoSlides[qrIndex].signupUrl).toBeUndefined();
    expect(demoSlides[qrIndex].heading).toBe('签到 Sign up');
    expect(demoSlides[qrIndex + 1].kind).toBe('closing');
    const owned = parseStudyPack({ ...demo, leaderId: 'uid-lead' });
    const ownedQr = buildSlides(owned)[qrIndex];
    expect(ownedQr.signupUrl).toBe(currentSignupUrl(owned.id));
    expect(ownedQr.signupUrl).toMatch(/#\/signup\/2026-10-02-matt6$/);
  });

  it('keeps lifeMenu rows on a single slide', () => {
    const slides = buildSlides(loadRealPack());
    const lifeMenu = slides.filter(s => s.kind === 'lifeMenu');
    expect(lifeMenu).toHaveLength(1);
    expect(lifeMenu[0].rows).toHaveLength(7);
  });
});

describe('getPackIdFromHash', () => {
  it('extracts the pack id from the TV route', () => {
    expect(getPackIdFromHash('#/pack/2026-10-02-matt6')).toBe('2026-10-02-matt6');
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
