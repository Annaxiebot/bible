/**
 * packAssembly.test.ts — the assembled pack passes parseStudyPack, follows the
 * sample pack's shape (section order, headings, Chinese-first lines, seven
 * life areas), carries the shared QR line (no static image), and gets a "local-" id.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { assemblePack, passageLabel, stampLeader, SECTION_HEADINGS, PRIVACY_LINE } from '../packAssembly';
import { SU_QR_BODY } from '../../signup/signupStrings';
import { validateGenerated } from '../generatedPack';
import { parseStudyPack, buildSlides } from '../../studypack/packTypes';
import { LIFE_AREAS, TRANSLATIONS, BILINGUAL_SEPARATOR } from '../../studypack/principles';
import { isLocalPackId } from '../../studypack/packSource';
import { TEST_PACK_PATH } from '../../studypack/__tests__/fixtures';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';

const verses = Array.from({ length: 15 }, (_, i) => ({
  num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}`,
}));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED));

describe('stampLeader', () => {
  it('sets leaderId for a signed-in leader and leaves a signed-out save untouched (demo pack)', () => {
    expect(pack.leaderId).toBeUndefined();
    expect(stampLeader(pack, 'uid-lead').leaderId).toBe('uid-lead');
    expect(stampLeader(pack, null)).toBe(pack);
    expect(() => parseStudyPack(stampLeader(pack, 'uid-lead'))).not.toThrow();
  });
});

describe('passageLabel', () => {
  it('is Chinese first, with an en dash range', () => {
    expect(passageLabel(JOHN3_REQUEST)).toEqual({
      zh: '约翰福音 3:22–36', en: 'John 3:22–36', ref: '约翰福音 3:22–36 · John 3:22–36',
    });
    expect(passageLabel({ ...JOHN3_REQUEST, bookId: 'PSA', chapter: 23, verseFrom: 1, verseTo: 1 }).en).toBe('Psalm 23:1');
  });
});

describe('assemblePack', () => {
  it('passes parseStudyPack and mirrors the sample pack section order', () => {
    expect(() => parseStudyPack(pack)).not.toThrow();
    expect(pack.sections.map(s => s.kind)).toEqual([
      'title', 'scripture', 'context', 'originalLanguage', 'crossRefs',
      'discussion', 'lifeMenu', 'reflection', 'qr', 'closing',
    ]);
    expect(pack.enVersion).toBe(TRANSLATIONS.en.label);
    expect(pack.passageRef).toBe('约翰福音 3:22–36 · John 3:22–36');
  });

  it('gets a local id and the right date', () => {
    expect(pack.id).toBe('local-2026-10-02-jhn3');
    expect(isLocalPackId(pack.id)).toBe(true);
    expect(pack.date).toBe('2026-10-02');
  });

  it('embeds the bundled verses untouched (never model text)', () => {
    const scripture = pack.sections.find(s => s.kind === 'scripture')!;
    expect(scripture.verses).toEqual(verses);
    expect(scripture.heading).toBe(`${SECTION_HEADINGS.scripture} — 约翰福音 3:22–36 John`);
    expect(scripture.keyPhrase).toContain('(v.30)');
  });

  it('puts Chinese first in the title, every heading and every body line', () => {
    expect(pack.title).toMatch(/^[一-鿿]/);
    for (const s of pack.sections) {
      expect(s.heading).toMatch(/^[一-鿿]/);
      for (const line of [...(s.body ?? []), ...(s.questions ?? []), ...(s.rows ?? []).map(r => r.practice)]) {
        const at = line.indexOf(BILINGUAL_SEPARATOR);
        expect(at).toBeGreaterThan(0);
        // The half before the separator is the Chinese one (original-language
        // notes may open with a Greek word, as the sample pack does).
        expect(line.slice(0, at)).toMatch(/[一-鿿]/);
        if (s.kind !== 'originalLanguage') expect(line).toMatch(/^[「一-鿿]/);
      }
    }
  });

  it('uses the canonical seven life areas in order', () => {
    const lifeMenu = pack.sections.find(s => s.kind === 'lifeMenu')!;
    expect(lifeMenu.rows!.map(r => r.area)).toEqual([...LIFE_AREAS]);
  });

  it('writes cross-references as bilingual labels the TV can linkify', () => {
    const crossRefs = pack.sections.find(s => s.kind === 'crossRefs')!;
    expect(crossRefs.body![0]).toMatch(/^约翰福音 1:26–27 · John 1:26–27 — /);
    expect(crossRefs.body).toHaveLength(3);
  });

  it('adds the app-owned reflection privacy line and the closing lead line', () => {
    const reflection = pack.sections.find(s => s.kind === 'reflection')!;
    expect(reflection.body![3]).toBe(PRIVACY_LINE);
    expect(reflection.body![0]).toMatch(/^周二跟进：/);
    const closing = pack.sections.find(s => s.kind === 'closing')!;
    expect(closing.body![1]).toMatch(/^「.*」 · “.*”$/);
  });

  // Known R3 exception: the sample pack is JSON data and cannot import
  // SU_QR_BODY, so the literal lives there too. This equality is the drift
  // guard — if either side changes, this test fails at test time.
  it('the qr section carries only the shared sign-up line, identical to the sample pack (no static image/url)', () => {
    const sample = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')) as { sections: Array<{ kind: string; image?: string; url?: string; body?: string[] }> };
    const sampleQr = sample.sections.find(s => s.kind === 'qr')!;
    expect(sampleQr.body).toEqual([SU_QR_BODY]);
    expect(sampleQr.image).toBeUndefined();
    expect(sampleQr.url).toBeUndefined();
    const qr = pack.sections.find(s => s.kind === 'qr')!;
    expect(qr.body).toEqual([SU_QR_BODY]);
    expect(qr.image).toBeUndefined();
    expect(qr.url).toBeUndefined();
  });

  it('lesson number and title go into the title slide', () => {
    const numbered = assemblePack({ ...JOHN3_REQUEST, lessonNumber: 8 }, verses, validateGenerated(JOHN3_GENERATED));
    expect(numbered.sections[0].heading).toMatch(/^第8课 祂必兴旺/);
  });

  it('renders as 18 slides for 15 verses (1 + 5 scripture + 5 questions + 7 sections)', () => {
    expect(buildSlides(pack)).toHaveLength(18);
  });
});
