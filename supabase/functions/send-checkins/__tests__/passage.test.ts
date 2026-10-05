/**
 * passage.test.ts — the studied verses in a check-in email · 邮件里的本周经文
 *
 * ADR-0004 §12: a summary row's verses + key_verse become CheckinPack.passage
 * (packSource), and renderCheckin puts the passage line and the key verse
 * (和合本 then BSB) between the prompt and the link, and the whole passage
 * between the link and the stop line — email only. An older row without
 * verses renders exactly as before. Verses are copied, never rewritten.
 */
import { describe, it, expect } from 'vitest';
import {
  renderCheckin, passageLine, keyVerseLine, passageVerseLine, stopLine, checkinPageUrl, greeting, practiceLine,
  FULL_PASSAGE_HEADING, WELCOME_KIND, SITE_FOOTER_LINE, CheckinPack, MemberContext, MessageKind,
} from '../templates.ts';
import { bodyLines } from './textBody';
import { loadCheckinPack, packFromSummary, passageFromSummary, PackSummaryRow, SUMMARY_COLUMNS } from '../packSource.ts';

/** The first verses of the live 箴言 1 pack (bundled 和合本 + BSB, as stored in pack_summaries). */
const PRO1_VERSES = [
  { num: 1, cuv: '以色列王大卫儿子所罗门的箴言：', en: 'These are the proverbs of Solomon son of David, king of Israel,' },
  { num: 7, cuv: '敬畏耶和华是知识的开端；愚妄人藐视智慧和训诲。', en: 'The fear of the LORD is the beginning of knowledge, but fools despise wisdom and discipline.' },
  { num: 8, cuv: '我儿，要听你父亲的训诲，不可离弃你母亲的法则〔或作：指教〕；', en: 'Listen, my son, to your father’s instruction, and do not forsake the teaching of your mother.' },
];
const REF = '箴言 1:1–33 · Proverbs 1:1–33';
const ROW: PackSummaryRow = {
  pack_id: 'local-2026-10-02-pro1', leader_id: 'uid-lead', title: '第1课 箴言 1:1–33',
  reflection_lines: ['周二 · Tue', '周四 · did it happen?', '周末 · Weekend'],
  passage_ref: REF, verses: PRO1_VERSES, key_verse: 7,
};
const PACK: CheckinPack = packFromSummary(ROW);
const OLD: CheckinPack = packFromSummary({ ...ROW, verses: null, key_verse: null });
const SIGNUP_ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';
const MEMBER: MemberContext = { name: '小明', signupId: SIGNUP_ID, practices: ['睡前程序 · Wind-down'] };

describe('packSource: verses from the summary row', () => {
  it('selects the new columns and turns them into the pack passage', async () => {
    expect(SUMMARY_COLUMNS.split(', ')).toEqual(expect.arrayContaining(['passage_ref', 'verses', 'key_verse']));
    const pack = await loadCheckinPack(ROW.pack_id, { readSummary: async () => ROW, fetchPublic: async () => null });
    expect(pack.passage).toEqual({ ref: REF, verses: PRO1_VERSES, keyVerse: 7 });
  });

  it('an older row (NULL verses), an empty or malformed array → no passage; a missing key verse → null', () => {
    expect(OLD.passage).toBeUndefined();
    expect('passage' in OLD).toBe(false);
    expect(passageFromSummary({ ...ROW, verses: [] })).toBeUndefined();
    expect(passageFromSummary({ ...ROW, verses: [{ num: 1, cuv: '', en: 'x' }] })).toBeUndefined();
    expect(passageFromSummary({ ...ROW, verses: { num: 1 } })).toBeUndefined();
    expect(passageFromSummary({ ...ROW, key_verse: null })!.keyVerse).toBeNull();
  });
});

describe('renderCheckin with the passage', () => {
  it('order: greeting, practice, prompt | passage line, key verse | link | whole passage | stop line', () => {
    const lines = renderCheckin('thu', PACK, MEMBER).text.split('\n');
    expect(lines).toEqual([
      greeting('小明'),
      practiceLine('睡前程序 · Wind-down'),
      '周四 · did it happen?',
      '',
      `本周经文 · This week's passage: ${REF}`,
      '「敬畏耶和华是知识的开端；愚妄人藐视智慧和训诲。」(v.7) · “The fear of the LORD is the beginning of knowledge, but fools despise wisdom and discipline.” (v.7)',
      '',
      checkinPageUrl(SIGNUP_ID, 'thu'),
      '',
      FULL_PASSAGE_HEADING,
      '1 以色列王大卫儿子所罗门的箴言： · 1 These are the proverbs of Solomon son of David, king of Israel,',
      passageVerseLine(PRO1_VERSES[1]),
      passageVerseLine(PRO1_VERSES[2]),
      '',
      stopLine(SIGNUP_ID),
      '',
      SITE_FOOTER_LINE,
    ]);
    expect(lines[4]).toBe(passageLine(REF));
    expect(lines[5]).toBe(keyVerseLine(PRO1_VERSES[1]));
  });

  it('Chinese first on every verse line; the text is the stored verse, unchanged', () => {
    for (const line of [keyVerseLine(PRO1_VERSES[1]), ...PRO1_VERSES.map(passageVerseLine)]) {
      expect(line.search(/[一-鿿]/)).toBeLessThan(line.search(/[A-Za-z]/));
    }
    const text = renderCheckin('tue', PACK, MEMBER).text;
    for (const v of PRO1_VERSES) {
      expect(text).toContain(v.cuv);
      expect(text).toContain(v.en);
    }
  });

  it('every kind (welcome, tue, thu, weekend) carries it; a test recipient without a signup ends on the passage', () => {
    for (const kind of [WELCOME_KIND, 'tue', 'thu', 'weekend'] as MessageKind[]) {
      const text = renderCheckin(kind, PACK, MEMBER).text;
      expect(text).toContain(passageLine(REF));
      expect(text).toContain(FULL_PASSAGE_HEADING);
    }
    const lines = bodyLines(renderCheckin('tue', PACK, { name: 'Chris', signupId: null, practices: [] }).text);
    expect(lines[lines.length - 1]).toBe(passageVerseLine(PRO1_VERSES[2]));
  });

  it('no key verse → passage line only; SMS keeps the head but never the whole passage', () => {
    const noKey = packFromSummary({ ...ROW, key_verse: null });
    const text = renderCheckin('tue', noKey, MEMBER).text;
    expect(text).toContain(passageLine(REF));
    expect(text).not.toContain('(v.7)');
    const sms = renderCheckin('tue', PACK, MEMBER, 'sms').text;
    expect(sms).toContain(keyVerseLine(PRO1_VERSES[1]));
    expect(sms).not.toContain(FULL_PASSAGE_HEADING);
    expect(sms).not.toContain(passageVerseLine(PRO1_VERSES[0]));
    expect(sms).not.toContain(SITE_FOOTER_LINE);   // SMS stays short: no site line
  });

  it('a summary without verses renders exactly as before — no empty headings, no blank lines', () => {
    for (const kind of [WELCOME_KIND, 'tue', 'thu', 'weekend'] as MessageKind[]) {
      const text = renderCheckin(kind, OLD, MEMBER).text;
      expect(text).not.toContain('本周经文');
      expect(text).not.toContain(FULL_PASSAGE_HEADING);
      expect(bodyLines(text)).not.toContain('');
      expect(bodyLines(text)).toHaveLength(5);
    }
  });
});
