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
  ASK_AI_LANGUAGE_RULES,
  TYPE_SCALE,
  CONTENT_LANGUAGES,
  CONTENT_LANGUAGE_CONTRACTS,
  DEFAULT_CONTENT_LANGUAGE,
  LEGACY_CONTENT_LANGUAGE,
  isContentLanguage,
  contentLine,
  PACK_CONTENT_CONTRACT,
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

describe('Ask AI language follows the pack setting (owner, 2026-10-04)', () => {
  it('zh-keywords: Chinese with English keywords, no second English version', () => {
    expect(ASK_AI_LANGUAGE_RULES['zh-keywords']).toContain('Do NOT add a second, English version');
  });
  it('bilingual: Chinese first, then the same answer in English', () => {
    expect(ASK_AI_LANGUAGE_RULES.bilingual).toContain('Simplified Chinese first');
    expect(ASK_AI_LANGUAGE_RULES.bilingual).toContain('then the same answer in English');
  });
  it('en-keywords: English with Chinese keywords, no second Chinese version', () => {
    expect(ASK_AI_LANGUAGE_RULES['en-keywords']).toContain('Do NOT add a second, Chinese version');
  });
});

describe('ASK_AI_ANSWER_CONTRACT', () => {
  it('contains the key phrases ADR-0003 §9 states', () => {
    expect(ASK_AI_ANSWER_CONTRACT).toContain('4 short sentences');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('~120 words');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('从整本圣经来看 · Across the whole Bible');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('Never stop at');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('historical and cultural background');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('一种理解 · one reading');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('citing the verse');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('follow the CONTENT LANGUAGE rule below exactly');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('overrides the language of the question');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('never equate a medical or emotional condition');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('MUST be introduced');
    expect(ASK_AI_ANSWER_CONTRACT).toContain('LaTeX or math notation');
  });
});

describe('content language (ADR-0003 §1 note)', () => {
  it('has three modes, Chinese first; new packs default to Chinese with English keywords, legacy packs read as bilingual', () => {
    expect(CONTENT_LANGUAGES).toEqual(['zh-keywords', 'bilingual', 'en-keywords']);
    expect(DEFAULT_CONTENT_LANGUAGE).toBe('zh-keywords');
    expect(LEGACY_CONTENT_LANGUAGE).toBe('bilingual');
    expect(isContentLanguage('bilingual')).toBe(true);
    expect(isContentLanguage('klingon')).toBe(false);
    expect(isContentLanguage(null)).toBe(false);
  });

  it('CONTENT_LANGUAGE_CONTRACTS is the single map of the three format contracts, each with a line rule and total target (+ the server Ask-AI rule per mode)', () => {
    expect(Object.keys(CONTENT_LANGUAGE_CONTRACTS).sort()).toEqual([...CONTENT_LANGUAGES].sort());
    for (const mode of CONTENT_LANGUAGES) {
      const c = CONTENT_LANGUAGE_CONTRACTS[mode];
      expect(c.lineRule).toMatch(/^CONTENT LANGUAGE:/);
      expect(ASK_AI_LANGUAGE_RULES[mode]).toMatch(/^CONTENT LANGUAGE \(the leader chose this for the pack\):/);
      expect(c.totalTarget.length).toBeGreaterThan(20);
    }
    // The shared contract no longer demands two halves — the mode's rule does.
    expect(PACK_CONTENT_CONTRACT).not.toMatch(/every bilingual item has/);
    expect(PACK_CONTENT_CONTRACT).toMatch(/Chinese is shown first, English second/);
  });

  it('contentLine shows the mode\'s half: zh only, "中文 · English", or en only', () => {
    expect(contentLine('zh-keywords', '忧虑（anxiety）', 'anxiety')).toBe('忧虑（anxiety）');
    expect(contentLine('bilingual', '忧虑', 'anxiety')).toBe('忧虑 · anxiety');
    expect(contentLine('en-keywords', '忧虑', 'anxiety (忧虑)')).toBe('anxiety (忧虑)');
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
