/**
 * packEdits.test.ts — the editor's feedback-form edit + its validation · 编辑操作测试
 */
import { describe, it, expect } from 'vitest';
import { withFeedbackForm, validateEdited } from '../packEdits';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { NS_ERR_FEEDBACK_FORM } from '../newStudyStrings';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));
const FORM = 'https://docs.google.com/forms/d/e/x/viewform';

describe('withFeedbackForm', () => {
  it('sets the URL and only the non-empty entry ids; an empty URL removes both fields', () => {
    const withBoth = withFeedbackForm(pack, ` ${FORM} `, { name: 'entry.1', practice: ' ' });
    expect(withBoth.feedbackFormUrl).toBe(FORM);
    expect(withBoth.feedbackFormEntries).toEqual({ name: 'entry.1' });
    const plain = withFeedbackForm(pack, FORM, { name: '', practice: '' });
    expect(plain.feedbackFormEntries).toBeUndefined();
    const removed = withFeedbackForm(withBoth, '', { name: 'entry.1', practice: '' });
    expect(removed.feedbackFormUrl).toBeUndefined();
    expect(removed.feedbackFormEntries).toBeUndefined();
    expect(validateEdited(withBoth)).toBeNull();
  });

  it('a half-typed link blocks Save with the bilingual reason; assemblePack carries a pasted link', () => {
    expect(validateEdited(withFeedbackForm(pack, 'https://docs.goo', { name: '', practice: '' }))).toBe(NS_ERR_FEEDBACK_FORM);
    const pasted = assemblePack({ ...JOHN3_REQUEST, feedbackFormUrl: FORM }, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));
    expect(pasted.feedbackFormUrl).toBe(FORM);
    expect(pack.feedbackFormUrl).toBeUndefined();
  });
});
