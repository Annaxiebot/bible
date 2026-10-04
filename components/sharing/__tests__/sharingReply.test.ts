/**
 * sharingReply.test.ts — the reply validator · 上周分享校验测试 (ADR-0008)
 */
import { describe, it, expect } from 'vitest';
import { validateSharingReply, SharingError } from '../sharingReply';
import { makeScrubber } from '../sharingScrub';
import { SCRUBBED, SH_ERR_INVALID } from '../sharingStrings';
import { QUOTE_MAX_ZH_CHARS } from '../sharingPrompt';
import { SIGNUPS, GOOD_REPLY } from './fixtures';

const scrub = makeScrubber(SIGNUPS);
const zh = (text: string) => ({ zh: text });
const good = () => JSON.parse(GOOD_REPLY) as Record<string, unknown>;

function invalidKind(raw: Record<string, unknown>, mode: 'zh-keywords' | 'bilingual' = 'zh-keywords'): string {
  try {
    validateSharingReply(raw, mode, scrub);
  } catch (err) {
    expect(err).toBeInstanceOf(SharingError);
    expect((err as Error).message).toContain(SH_ERR_INVALID);
    return (err as SharingError).kind;
  }
  throw new Error('expected a SharingError');
}

describe('validateSharingReply', () => {
  it('returns display lines for the mode', () => {
    expect(validateSharingReply(good(), 'zh-keywords', scrub)).toEqual({
      themes: ['散步让焦虑（anxiety）变少', '家人一起操练更容易坚持'],
      quotes: ['晚饭后走一走，心里松了', '和孩子一起祷告'],
      question: '上周的操练里，哪一刻你经历了不再忧虑？',
    });
  });

  it('bilingual mode needs both halves and shows "中文 · English"', () => {
    const raw = { themes: [{ zh: '一', en: 'one' }, { zh: '二', en: 'two' }], question: { zh: '问', en: 'Q' } };
    expect(validateSharingReply(raw, 'bilingual', scrub)).toEqual({ themes: ['一 · one', '二 · two'], quotes: [], question: '问 · Q' });
    expect(invalidKind({ ...raw, question: { zh: '问' } }, 'bilingual')).toBe('invalid-reply');
  });

  it('rejects fewer than 2 themes, a missing question or non-array quotes; trims themes to 3', () => {
    expect(invalidKind({ ...good(), themes: [zh('只有一个')] })).toBe('invalid-reply');
    expect(invalidKind({ ...good(), question: undefined })).toBe('invalid-reply');
    expect(invalidKind({ ...good(), quotes: 'x' })).toBe('invalid-reply');
    const four = validateSharingReply({ ...good(), themes: ['1', '2', '3', '4'].map(zh) }, 'zh-keywords', scrub);
    expect(four.themes).toEqual(['1', '2', '3']);
  });

  it(`drops quotes over ${QUOTE_MAX_ZH_CHARS} 字 and keeps at most 3`, () => {
    const long = zh('长'.repeat(QUOTE_MAX_ZH_CHARS + 1));
    const ok = validateSharingReply({ ...good(), quotes: [long, zh('a'), zh('b'), zh('c'), zh('d')] }, 'zh-keywords', scrub);
    expect(ok.quotes).toEqual(['a', 'b', 'c']);
  });

  it('scrubs a member name or contact the model produced anyway', () => {
    const raw = { ...good(), quotes: [zh('王小明说走路有用')], question: zh('问 ann@example.org？') };
    const out = validateSharingReply(raw, 'zh-keywords', scrub);
    expect(out.quotes[0]).toBe(`${SCRUBBED}说走路有用`);
    expect(out.question).toBe(`问 ${SCRUBBED}？`);
  });
});
