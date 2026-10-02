/**
 * principles.test.ts — keeps the principles module in sync with ADR-0003
 * (docs/adr/0003-scripturetolife-content-principles.md): the Ask-AI contract
 * carries the key phrases the ADR states, the seven life areas are stable
 * and Chinese-first, translations are CUV + BSB, and the TV type scale
 * respects the senior-readable floors with px floors for phones.
 */
import { describe, it, expect } from 'vitest';
import {
  bilingual,
  TRANSLATIONS,
  LIFE_AREAS,
  ASK_AI_ANSWER_CONTRACT,
  TYPE_SCALE,
} from '../principles';

describe('bilingual()', () => {
  it('formats Chinese first, English second (ADR-0003 §1)', () => {
    expect(bilingual('问AI', 'Ask AI')).toBe('问AI Ask AI');
  });
});

describe('TRANSLATIONS', () => {
  it('pins 和合本 (cuv) + BSB (bsb) with their display labels (§2–3)', () => {
    expect(TRANSLATIONS.zh).toEqual({ id: 'cuv', label: '和合本' });
    expect(TRANSLATIONS.en).toEqual({ id: 'bsb', label: 'BSB' });
  });
});

describe('LIFE_AREAS', () => {
  it('has the seven stable areas, each Chinese-first (§12)', () => {
    expect(LIFE_AREAS).toEqual([
      '健康 Health', '关系 Relationships', '家庭 Family', '工作 Work',
      '情绪 Emotional', '财务 Finance', '属灵 Spiritual',
    ]);
    for (const area of LIFE_AREAS) {
      expect(area).toMatch(/^[一-鿿]+ [A-Z]/); // 中文 then English
    }
  });
});

describe('ASK_AI_ANSWER_CONTRACT', () => {
  it('contains the key phrases ADR-0003 §9 states', () => {
    expect(ASK_AI_ANSWER_CONTRACT).toContain('2 short');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('~60 words');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('citing the verse');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('language of the question');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('Chinese answer with');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('key terms also in English');
  });
});

describe('TYPE_SCALE', () => {
  const vhOf = (v: string) => Number(/([\d.]+)vh/.exec(v)![1]);
  const pxOf = (v: string) => Number(/(\d+)px/.exec(v)![1]);

  it('meets the senior-readable vh floors on a 1080p TV', () => {
    expect(vhOf(TYPE_SCALE.heading)).toBeGreaterThanOrEqual(7);
    expect(vhOf(TYPE_SCALE.body)).toBeGreaterThanOrEqual(5);
    expect(vhOf(TYPE_SCALE.verse)).toBeGreaterThanOrEqual(3.6);
    expect(vhOf(TYPE_SCALE.lifeMenuRow)).toBeGreaterThanOrEqual(3.2);
    expect(vhOf(TYPE_SCALE.question)).toBeGreaterThanOrEqual(5);
    expect(vhOf(TYPE_SCALE.popup)).toBeGreaterThanOrEqual(3);
    expect(vhOf(TYPE_SCALE.answerShort)).toBeGreaterThanOrEqual(6);
    expect(vhOf(TYPE_SCALE.answerMedium)).toBeGreaterThanOrEqual(5);
    expect(vhOf(TYPE_SCALE.answerLong)).toBeGreaterThanOrEqual(4);
  });

  it('keeps a ≥16px floor on phones where vh collapses', () => {
    for (const value of Object.values(TYPE_SCALE)) {
      expect(value).toMatch(/^max\(\d+px, [\d.]+vh\)$/);
      expect(pxOf(value)).toBeGreaterThanOrEqual(16);
    }
  });
});
