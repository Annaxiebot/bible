/**
 * sharingScrub.test.ts — the privacy guard before the AI · 隐私过滤测试 (ADR-0008)
 */
import { describe, it, expect } from 'vitest';
import { makeScrubber, identifierTerms, MIN_PHONE_DIGITS } from '../sharingScrub';
import { SCRUBBED } from '../sharingStrings';
import { SIGNUPS } from './fixtures';

const scrub = makeScrubber(SIGNUPS);

describe('makeScrubber', () => {
  it('removes every exact occurrence of a member name (CJK anywhere, Latin as whole words, any case)', () => {
    expect(scrub('王小明说：王小明很好')).toBe(`${SCRUBBED}说：${SCRUBBED}很好`);
    expect(scrub('ann lee and ANN walked')).toBe(`${SCRUBBED} and ${SCRUBBED} walked`);
    expect(scrub('we planned a walk with Leeds friends')).toBe('we planned a walk with Leeds friends');
  });

  it('removes email- and phone-shaped text even when it is not a member\'s', () => {
    expect(scrub('write to someone@else.com today')).toBe(`write to ${SCRUBBED} today`);
    expect(scrub('电话 408-555-9876 找我')).toBe(`电话 ${SCRUBBED} 找我`);
    expect(scrub('call (650) 555 0000')).toBe(`call ${SCRUBBED}`);
    expect(scrub('+1 408 555 1234')).toBe(SCRUBBED);
  });

  it(`leaves short digit runs (< ${MIN_PHONE_DIGITS} digits) such as verse numbers and times alone`, () => {
    expect(scrub('读了 6:25–34，走了 30 分钟，10-12 点')).toBe('读了 6:25–34，走了 30 分钟，10-12 点');
  });

  it('removes a member\'s stored email and phone exactly', () => {
    expect(scrub('ming@example.org / +14085551234')).toBe(`${SCRUBBED} / ${SCRUBBED}`);
  });

  it('lists name parts of 2+ characters, longest first; a scrubber with no members only applies the patterns', () => {
    expect(identifierTerms([{ name: 'Li Wei Z', email: null, phone: null }])).toEqual(['Li Wei Z', 'Wei', 'Li']);
    expect(makeScrubber([])('王小明 a@b.co')).toBe(`王小明 ${SCRUBBED}`);
  });
});
