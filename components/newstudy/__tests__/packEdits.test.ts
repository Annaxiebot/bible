/**
 * packEdits.test.ts — an old pack that still carries Google Forms keys edits and validates · 编辑操作测试
 *
 * Google Forms was removed 2026-10-05 (ADR-0004 §9). Packs saved before then
 * may hold feedbackFormUrl / feedbackFormEntries — even values the old
 * validator would have rejected. They must not block Save, and an edit must
 * not write them back.
 */
import { describe, it, expect } from 'vitest';
import { validateEdited, withTitle } from '../packEdits';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { parseStudyPack } from '../../studypack/packTypes';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

describe('legacy Google Forms keys', () => {
  it('a freshly assembled pack carries none', () => {
    expect(Object.keys(pack)).not.toContain('feedbackFormUrl');
    expect(Object.keys(pack)).not.toContain('feedbackFormEntries');
  });

  it('an old pack with form keys (valid or not) parses, validates, and an edit drops them', () => {
    for (const legacy of [
      { feedbackFormUrl: 'https://docs.google.com/forms/d/e/x/viewform', feedbackFormEntries: { name: 'entry.1' } },
      { feedbackFormUrl: 'https://docs.goo', feedbackFormEntries: 'not-an-object' },
    ]) {
      const parsed = parseStudyPack({ ...pack, ...legacy });
      expect(validateEdited(parsed)).toBeNull();
      expect(JSON.stringify(withTitle(parsed, 'New'))).not.toMatch(/feedbackForm|docs\.goo/);
    }
  });
});
