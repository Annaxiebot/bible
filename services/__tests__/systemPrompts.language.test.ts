/**
 * systemPrompts.language.test.ts — the scholar prompt states ONE language rule (ADR-0017)
 *
 * Before ADR-0017 the prompt said "two sections, Chinese then English" AND
 * appended "always write in Simplified Chinese as the primary language … this
 * applies to every response" — two rules that contradict each other. The
 * format it asks for must also be the one services/bilingualAnswer parses.
 */
import { describe, it, expect } from 'vitest';
import { BIBLE_SCHOLAR_SYSTEM_PROMPT, JOURNAL_LANGUAGE_DIRECTIVE } from '../systemPrompts';
import { ZH_SECTION_HEADING, EN_SECTION_HEADING, splitBilingualAnswer } from '../bilingualAnswer';

const lines = BIBLE_SCHOLAR_SYSTEM_PROMPT.split('\n');

describe('BIBLE_SCHOLAR_SYSTEM_PROMPT — one language rule', () => {
  it('has exactly one language rule, and no Chinese-only directive', () => {
    expect(lines.filter(l => /LANGUAGE/.test(l))).toHaveLength(1);
    expect(BIBLE_SCHOLAR_SYSTEM_PROMPT).not.toMatch(/primary language/i);
    expect(BIBLE_SCHOLAR_SYSTEM_PROMPT).not.toMatch(/every response/i);
    expect(BIBLE_SCHOLAR_SYSTEM_PROMPT).not.toContain(JOURNAL_LANGUAGE_DIRECTIVE.trim());
  });

  it('asks for the two section headings, each on a line of its own, 中文 first', () => {
    const zh = lines.indexOf(ZH_SECTION_HEADING);
    const en = lines.indexOf(EN_SECTION_HEADING);
    expect(zh).toBeGreaterThan(-1);
    expect(en).toBeGreaterThan(zh);
  });

  it('no longer mentions the retired [SPLIT] marker (scholar prompt or journal directive)', () => {
    expect(BIBLE_SCHOLAR_SYSTEM_PROMPT).not.toMatch(/SPLIT/i);
    expect(JOURNAL_LANGUAGE_DIRECTIVE).not.toMatch(/SPLIT/i);
  });

  it('its own example answer parses into the two panes', () => {
    const example = lines.slice(lines.indexOf(ZH_SECTION_HEADING), lines.indexOf(EN_SECTION_HEADING) + 3).join('\n');
    const { zh, en } = splitBilingualAnswer(example);
    expect(zh).toContain('如果您需要更深入的解析');
    expect(en).toContain('Please let me know');
  });
});
