/**
 * practices.test.ts — any number of practices, new rows and old · 多项操练测试
 *
 * The shared reader (practices.ts) over new rows (practices JSONB) and old
 * rows (legacy first/second columns only), the insert's legacy mirror, and
 * the emails: welcome and Tue/Thu/weekend list every practice, one
 * Chinese-first line each, in the member's order.
 */
import { describe, it, expect } from 'vitest';
import { chosenPractices, practiceItems, practiceTexts, practiceColumns, ownVersionLine, OWN_VERSION_LABEL } from '../practices.ts';
import { memberContext, SignupRow } from '../recipients.ts';
import { renderCheckin, practiceLine, WELCOME_KIND, CHECKIN_KINDS, CheckinPack } from '../templates.ts';

const A = { area: '家庭 Family', practice: '一起吃饭 · Eat together' };
const B = { area: '工作 Work', practice: '写下忧虑 · Write it down' };
const C = { area: '金钱 Money', practice: '记账 · Track spending' };
const OLD = { practice_area: A.area, practice_text: A.practice, practice2_area: B.area, practice2_text: B.practice, practice_note: null };
const NEW = { ...practiceColumns([A, B, C]), practice_note: null };

describe('chosenPractices / practiceItems', () => {
  it('a new row reads the full practices list, in order', () => {
    expect(chosenPractices(NEW)).toEqual([A, B, C]);
    expect(practiceTexts(NEW)).toEqual([A.practice, B.practice, C.practice]);
  });

  it('an old row (no practices) falls back to the first + second columns', () => {
    expect(chosenPractices(OLD)).toEqual([A, B]);
    expect(chosenPractices({ ...OLD, practice2_text: null })).toEqual([A]);
    expect(chosenPractices({ ...OLD, practices: null })).toEqual([A, B]);
    expect(chosenPractices({ ...OLD, practices: [] })).toEqual([A, B]);
    expect(chosenPractices({})).toEqual([]);
  });

  it('ignores malformed entries; a list of only junk falls back to the legacy columns', () => {
    expect(chosenPractices({ practices: [A, { area: 1 }, null, 'x', { area: 'z', practice: '' }, C] })).toEqual([A, C]);
    expect(chosenPractices({ ...OLD, practices: [{ nope: true }] })).toEqual([A, B]);
    expect(chosenPractices({ ...OLD, practices: { area: 'x', practice: 'y' } })).toEqual([A, B]);
  });

  it('the own version never replaces a chosen practice: every practice keeps its text; the note is its own labelled line', () => {
    // Owner's live case: picked 属灵 Spiritual, typed "My own pratice: Diet".
    const spiritual = { area: '属灵 Spiritual', practice: '每天读经 · Read daily' };
    const row = { ...practiceColumns([spiritual]), practice_note: 'My own pratice: Diet' };
    expect(practiceItems(row)).toEqual([{ area: spiritual.area, text: spiritual.practice }]);
    expect(ownVersionLine(row)).toBe('我的版本 · My own version：My own pratice: Diet');
    expect(OWN_VERSION_LABEL).toBe('我的版本 · My own version');
    expect(practiceItems({ ...NEW, practice_note: ' 我的版本 ' })).toEqual([
      { area: A.area, text: A.practice }, { area: B.area, text: B.practice }, { area: C.area, text: C.practice },
    ]);
    expect(practiceItems({ practice_note: '只有我的' })).toEqual([]);
    expect(ownVersionLine({ practice_note: '只有我的' })).toBe(`${OWN_VERSION_LABEL}：只有我的`);
    expect(ownVersionLine({ practice_note: '  ' })).toBeNull();
    expect(ownVersionLine({})).toBeNull();
  });
});

describe('practiceColumns (the insert)', () => {
  it('carries every practice plus the legacy first/second for older readers', () => {
    expect(practiceColumns([A, B, C])).toEqual({
      practices: [A, B, C], practice_area: A.area, practice_text: A.practice, practice2_area: B.area, practice2_text: B.practice,
    });
    expect(practiceColumns([C])).toEqual({
      practices: [C], practice_area: C.area, practice_text: C.practice, practice2_area: null, practice2_text: null,
    });
  });
});

describe('emails list every practice', () => {
  const PACK: CheckinPack = {
    id: 'p', title: 'T', leaderId: 'uid', prompts: { tue: 'TUE', thu: 'THU', weekend: 'WKND' }, feedbackFormUrl: null, feedbackFormEntries: null,
  };
  const row = (over: Partial<SignupRow>): SignupRow => ({
    id: 's', pack_id: 'p', leader_id: 'uid', name: '小明', phone: null, email: 'a@x.org', consent_checkins: true,
    practice_text: null, practice_note: null, ...over,
  });

  it('a new row: welcome and every scheduled kind carry one practiceLine per practice, Chinese first, in order', () => {
    const member = memberContext(row(NEW));
    for (const kind of [WELCOME_KIND, ...CHECKIN_KINDS] as const) {
      const lines = renderCheckin(kind, PACK, member).text.split('\n');
      expect(lines.slice(1, 4)).toEqual([practiceLine(A.practice), practiceLine(B.practice), practiceLine(C.practice)]);
      expect(lines[1].indexOf('你选的操练')).toBe(0);
      expect(lines).toHaveLength(7);   // greeting, 3 practices, prompt, link, stop line
    }
  });

  it('an old row: the first and the second, then the own version as its own line (welcome and every kind)', () => {
    for (const kind of [WELCOME_KIND, ...CHECKIN_KINDS] as const) {
      const lines = renderCheckin(kind, PACK, memberContext(row({ ...OLD, practice_note: '十点关机' }))).text.split('\n');
      expect(lines.slice(1, 4)).toEqual([practiceLine(A.practice), practiceLine(B.practice), '我的版本 · My own version：十点关机']);
    }
    expect(renderCheckin('tue', PACK, memberContext(row({ ...OLD, practice_note: '十点关机' }))).text.split('\n')[4]).toBe('TUE');
  });
});
