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
import {
  JOHN3_GENERATED, JOHN3_REQUEST, JOHN3_GENERATED_ZH, JOHN3_REQUEST_ZH, JOHN3_KEYWORD_ZH, JOHN3_KEYWORD_DECREASE_ZH,
} from './fixtures';

const verses = Array.from({ length: 15 }, (_, i) => ({
  num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}`,
}));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

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
    const numbered = assemblePack({ ...JOHN3_REQUEST, lessonNumber: 8 }, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));
    expect(numbered.sections[0].heading).toMatch(/^第8课 祂必兴旺/);
  });

  it('renders as 18 slides for 15 verses (1 + 5 scripture + 5 questions + 7 sections)', () => {
    expect(buildSlides(pack)).toHaveLength(18);
  });
});

describe('assemblePack — content language', () => {
  const zhPack = assemblePack(JOHN3_REQUEST_ZH, verses, validateGenerated(JOHN3_GENERATED_ZH, JOHN3_REQUEST_ZH.contentLanguage));
  const byKind = (p: typeof zhPack, kind: string) => p.sections.find(s => s.kind === kind)!;

  it('stamps the pack with its mode; the bilingual pack keeps "中文 · English" lines', () => {
    expect(pack.contentLanguage).toBe('bilingual');
    expect(zhPack.contentLanguage).toBe('zh-keywords');
    expect(() => parseStudyPack(zhPack)).not.toThrow();
    expect(byKind(pack, 'context').body![0]).toContain(BILINGUAL_SEPARATOR);
  });

  it('zh-keywords: drafted lines are Chinese with the English keyword in parentheses, no " · English" half; headings and verses unchanged', () => {
    const context = byKind(zhPack, 'context').body!;
    expect(context[0]).toBe(`约翰的门徒为${JOHN3_KEYWORD_ZH}的事起了争论`);
    const drafted = [
      ...context, ...byKind(zhPack, 'originalLanguage').body!, ...byKind(zhPack, 'discussion').questions!,
      ...byKind(zhPack, 'lifeMenu').rows!.map(r => r.practice), ...byKind(zhPack, 'reflection').body!.slice(0, 3),
      byKind(zhPack, 'closing').body![1],
    ];
    for (const line of drafted) expect(line).not.toContain(BILINGUAL_SEPARATOR);
    expect(drafted.some(line => line.includes('baptism') && !line.includes(JOHN3_KEYWORD_ZH))).toBe(false);
    expect(byKind(zhPack, 'lifeMenu').rows![0].practice).toContain(JOHN3_KEYWORD_DECREASE_ZH);
    expect(byKind(zhPack, 'discussion').questions![3]).toContain(JOHN3_KEYWORD_DECREASE_ZH);
    expect(byKind(zhPack, 'reflection').body![0]).toBe('周二跟进：操练做了吗？');
    expect(byKind(zhPack, 'closing').body![1]).toBe(`「这周${JOHN3_KEYWORD_DECREASE_ZH}在哪里与真实生活相撞？」`);
    // Cross-reference labels, section headings, the title and the verses stay bilingual.
    expect(byKind(zhPack, 'crossRefs').body![0]).toMatch(/^.+ — 约翰早已说过自己不配$/);
    expect(zhPack.sections.map(s => s.heading)).toEqual(pack.sections.map(s => s.heading));
    expect(byKind(zhPack, 'scripture').verses).toEqual(verses);
    expect(byKind(zhPack, 'reflection').body![3]).toBe(PRIVACY_LINE);
    // The TV slides carry the same lines (no layout change needed).
    const slides = buildSlides(zhPack);
    expect(slides.find(s => s.kind === 'lifeMenu')!.rows![0].practice).toContain(JOHN3_KEYWORD_DECREASE_ZH);
    expect(slides.filter(s => s.kind === 'discussion')[3].question).toContain(JOHN3_KEYWORD_DECREASE_ZH);
  });

  it('en-keywords is the mirror: English lines only', () => {
    const enReq = { ...JOHN3_REQUEST, contentLanguage: 'en-keywords' as const };
    const enPack = assemblePack(enReq, verses, validateGenerated(JOHN3_GENERATED, enReq.contentLanguage));
    expect(enPack.contentLanguage).toBe('en-keywords');
    expect(byKind(enPack, 'context').body![0]).toBe(JOHN3_GENERATED.context[0].en);
    expect(byKind(enPack, 'reflection').body![0]).toBe('Tuesday check-in: Did the practice happen?');
  });
});
