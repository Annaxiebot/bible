/**
 * packIntegrity.test.ts — the committed sample pack carries real BSB text
 * and follows the content principles (ADR-0003): English verses are BSB
 * wording (not WEB), verse text matches the bundled Bible data verbatim,
 * life areas are the canonical seven, and bilingual lines are Chinese-first.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { parseStudyPack, StudyPack } from '../packTypes';
import { LIFE_AREAS, TRANSLATIONS } from '../principles';
import { TEST_PACK_PATH } from './fixtures';

const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const scripture = pack.sections.find(s => s.kind === 'scripture')!;

const BUNDLED_BSB_MAT6 = path.resolve(
  __dirname,
  `../../../public/bible-data/${TRANSLATIONS.en.id}/MAT/6.json`
);

describe('committed matt6 pack integrity', () => {
  it('labels its English translation BSB', () => {
    expect(pack.enVersion).toBe(TRANSLATIONS.en.label);
  });

  it('uses BSB wording for v.25 — "do not worry", not WEB\'s "don\'t be anxious"', () => {
    const v25 = scripture.verses!.find(v => v.num === 25)!;
    expect(v25.en).toContain('do not worry about your life');
    expect(v25.en.toLowerCase()).not.toContain("don’t be anxious");
    expect(v25.en.toLowerCase()).not.toContain("don't be anxious");
  });

  it('embeds verse text identical to the bundled BSB data (vv.25–34)', () => {
    const bundled = JSON.parse(readFileSync(BUNDLED_BSB_MAT6, 'utf-8')) as {
      verses: Array<{ verse: number; text: string }>;
    };
    const byNum = new Map(bundled.verses.map(v => [v.verse, v.text]));
    for (const v of scripture.verses!) {
      expect(v.en).toBe(byNum.get(v.num));
    }
  });

  it('uses the canonical seven life areas, Chinese-first', () => {
    const lifeMenu = pack.sections.find(s => s.kind === 'lifeMenu')!;
    expect(lifeMenu.rows!.map(r => r.area)).toEqual([...LIFE_AREAS]);
  });

  it('puts Chinese first in the title, passage ref and every section heading', () => {
    expect(pack.title.startsWith('不要忧虑')).toBe(true);
    expect(pack.passageRef.startsWith('马太福音')).toBe(true);
    for (const section of pack.sections) {
      // Heading starts with CJK (Chinese first), English follows.
      expect(section.heading).toMatch(/^[一-鿿]/);
    }
  });
});
