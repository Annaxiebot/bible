/**
 * generatedPack.test.ts — tolerant JSON extraction + strict validation:
 * valid, prose-wrapped, fenced, truncated; invalid cross-refs dropped (and
 * all-invalid fails); the seven life areas enforced and reordered.
 */
import { describe, it, expect } from 'vitest';
import { extractJsonObject, validateGenerated, parseCrossRef } from '../generatedPack';
import { LIFE_AREAS } from '../../studypack/principles';
import {
  NS_ERR_NO_JSON, NS_ERR_INVALID, NS_ERR_NO_CROSS_REFS, NS_ERR_LIFE_AREAS,
} from '../newStudyStrings';
import {
  JOHN3_GENERATED, JOHN3_REPLY_JSON, JOHN3_VALID_CROSS_REF_COUNT, JOHN3_REQUEST,
  JOHN3_GENERATED_ZH, JOHN3_REPLY_JSON_ZH, JOHN3_REQUEST_ZH, JOHN3_KEYWORD_ZH,
} from './fixtures';

const BILINGUAL = JOHN3_REQUEST.contentLanguage;
const ZH = JOHN3_REQUEST_ZH.contentLanguage;

describe('extractJsonObject', () => {
  it('parses a bare JSON object', () => {
    expect(extractJsonObject(JOHN3_REPLY_JSON)).toEqual(JOHN3_GENERATED);
  });

  it('tolerates prose and markdown fences around the object', () => {
    const wrapped = `Here is the pack:\n\`\`\`json\n${JOHN3_REPLY_JSON}\n\`\`\`\nHope this helps.`;
    expect(extractJsonObject(wrapped)).toEqual(JOHN3_GENERATED);
  });

  it('fails loudly on a truncated object instead of guessing', () => {
    const truncated = JOHN3_REPLY_JSON.slice(0, Math.floor(JOHN3_REPLY_JSON.length * 0.6));
    expect(() => extractJsonObject(truncated)).toThrow(NS_ERR_NO_JSON);
  });

  it('fails on no object at all, or a JSON array', () => {
    expect(() => extractJsonObject('Sorry, I cannot help with that.')).toThrow(NS_ERR_NO_JSON);
    expect(() => extractJsonObject('[1,2]')).toThrow(NS_ERR_NO_JSON);
  });
});

describe('parseCrossRef', () => {
  it('accepts real references in English book form, with and without ranges', () => {
    expect(parseCrossRef('Luke 12:22-31')).toMatchObject({ bookId: 'LUK', chapter: 12 });
    expect(parseCrossRef('1 Peter 5:7')).toMatchObject({ bookId: '1PE', chapter: 5, verses: [7] });
    expect(parseCrossRef('腓立比书 4:6')).toMatchObject({ bookId: 'PHP', chapter: 4 });
  });

  it('rejects unknown books, impossible chapters and non-strings', () => {
    expect(parseCrossRef('Narnia 3:1')).toBeNull();
    expect(parseCrossRef('John 99:1')).toBeNull();
    expect(parseCrossRef('Jude 2:1')).toBeNull();
    expect(parseCrossRef(42)).toBeNull();
    expect(parseCrossRef('no reference here')).toBeNull();
  });
});

describe('validateGenerated', () => {
  it('accepts the fixture, dropping the invalid cross-references and reordering the life menu', () => {
    const content = validateGenerated(JOHN3_GENERATED, BILINGUAL);
    expect(content.crossRefs).toHaveLength(JOHN3_VALID_CROSS_REF_COUNT);
    expect(content.crossRefs.map(c => c.ref.bookId)).toEqual(['JHN', 'MAT', 'PHP']);
    expect(content.lifeMenu.map(l => l.area)).toEqual([...LIFE_AREAS]);
    expect(content.lifeMenu[0].zh).toContain('散步');  // the "Health" item moved to slot 0
    expect(content.discussion).toHaveLength(5);
    expect(content.keyPhrase.verse).toBe(30);
  });

  it('fails when every cross-reference is invalid', () => {
    const bad = { ...JOHN3_GENERATED, crossRefs: [{ ref: 'Narnia 1:1', zh: 'x', en: 'y' }] };
    expect(() => validateGenerated(bad, BILINGUAL)).toThrow(NS_ERR_NO_CROSS_REFS);
  });

  it('fails when a life area is missing', () => {
    const bad = { ...JOHN3_GENERATED, lifeMenu: JOHN3_GENERATED.lifeMenu.slice(1) };
    expect(() => validateGenerated(bad, BILINGUAL)).toThrow(NS_ERR_LIFE_AREAS);
  });

  it('fails on a missing or monolingual field', () => {
    expect(() => validateGenerated({ ...JOHN3_GENERATED, closing: { zh: '只有中文' } }, BILINGUAL)).toThrow(NS_ERR_INVALID);
    const { reflection: _dropped, ...noReflection } = JOHN3_GENERATED;
    expect(() => validateGenerated(noReflection, BILINGUAL)).toThrow(NS_ERR_INVALID);
    expect(() => validateGenerated({ ...JOHN3_GENERATED, keyPhrase: { zh: 'a', en: 'b' } }, BILINGUAL)).toThrow(NS_ERR_INVALID);
  });
});

describe('validateGenerated — content language zh-keywords', () => {
  it('accepts a Chinese-only reply (no "en" halves) whose keywords carry the English in parentheses', () => {
    const content = validateGenerated(extractJsonObject(JOHN3_REPLY_JSON_ZH), ZH);
    expect(content.context[0].zh).toContain(JOHN3_KEYWORD_ZH);
    expect(content.context.every(c => c.en === '')).toBe(true);
    expect(content.discussion).toHaveLength(5);
    expect(content.crossRefs).toHaveLength(JOHN3_VALID_CROSS_REF_COUNT);
    expect(content.lifeMenu.map(l => l.area)).toEqual([...LIFE_AREAS]);
    expect(content.closing.en).toBe('');
    // Title and keyPhrase stay bilingual in every mode (they sit in fixed bilingual headings).
    expect(content.title).toEqual(JOHN3_GENERATED.title);
    expect(content.keyPhrase.verse).toBe(30);
  });

  it('the same Chinese-only reply is rejected in bilingual mode, and a bilingual reply is accepted in zh-keywords mode', () => {
    expect(() => validateGenerated(JOHN3_GENERATED_ZH, BILINGUAL)).toThrow(NS_ERR_INVALID);
    expect(validateGenerated(JOHN3_GENERATED, ZH).context[0].en).toContain('baptism');
  });

  it('en-keywords is the mirror: English-only items pass, Chinese-only fail', () => {
    const enOnly = { ...JOHN3_GENERATED, closing: { en: 'Where did decrease (衰微) collide with real life?' } };
    expect(validateGenerated(enOnly, 'en-keywords').closing).toEqual({ zh: '', en: 'Where did decrease (衰微) collide with real life?' });
    expect(() => validateGenerated(enOnly, ZH)).toThrow(NS_ERR_INVALID);
    expect(() => validateGenerated({ ...JOHN3_GENERATED_ZH, context: [{ zh: '' }] }, ZH)).toThrow(NS_ERR_INVALID);
  });

  it('still rejects wrong counts, a missing life area, all-invalid refs and a title without both halves', () => {
    expect(() => validateGenerated({ ...JOHN3_GENERATED_ZH, context: [] }, ZH)).toThrow(NS_ERR_INVALID);
    expect(() => validateGenerated({ ...JOHN3_GENERATED_ZH, lifeMenu: JOHN3_GENERATED_ZH.lifeMenu.slice(1) }, ZH)).toThrow(NS_ERR_LIFE_AREAS);
    expect(() => validateGenerated({ ...JOHN3_GENERATED_ZH, crossRefs: [{ ref: 'Narnia 1:1', zh: 'x' }] }, ZH)).toThrow(NS_ERR_NO_CROSS_REFS);
    expect(() => validateGenerated({ ...JOHN3_GENERATED_ZH, title: { zh: '只有中文' } }, ZH)).toThrow(NS_ERR_INVALID);
    expect(() => validateGenerated({ ...JOHN3_GENERATED_ZH, crossRefs: [{ ref: 'John 99:1', zh: 'x' }] }, ZH)).toThrow(NS_ERR_NO_CROSS_REFS);
  });
});
