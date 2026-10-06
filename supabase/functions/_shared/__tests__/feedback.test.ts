/**
 * feedback.test.ts — the feedback rules shared by page and function · 反馈规则测试 (ADR-0011)
 */
import { describe, it, expect } from 'vitest';
import {
  validateFeedback, cleanContext, feedbackHash, getFeedbackContextFromHash, isRateLimited,
  FEEDBACK_HASH, FEEDBACK_MAX_CHARS, FEEDBACK_EMAIL_MAX_CHARS, HONEYPOT_FIELD, RATE_LIMIT_COUNT, EMAIL_SHAPE,
} from '../feedback.ts';

describe('validateFeedback', () => {
  it('accepts a message alone; trims; email optional → null', () => {
    expect(validateFeedback({ message: '  很好 Great  ' })).toEqual({ ok: true, value: { message: '很好 Great', email: null, context: {} } });
    expect(validateFeedback({ message: 'hi', email: ' a@b.co ', [HONEYPOT_FIELD]: '' }))
      .toEqual({ ok: true, value: { message: 'hi', email: 'a@b.co', context: {} } });
  });

  it('a filled honeypot is refused before anything else', () => {
    expect(validateFeedback({ message: 'hi', [HONEYPOT_FIELD]: 'http://spam' })).toEqual({ ok: false, problem: 'honeypot' });
    expect(validateFeedback({ message: '', [HONEYPOT_FIELD]: 'x' })).toEqual({ ok: false, problem: 'honeypot' });
  });

  it('message must be 1..2000 characters after trimming', () => {
    for (const body of [{}, { message: '' }, { message: '   ' }, { message: 42 }, null, 'text']) {
      expect(validateFeedback(body)).toEqual({ ok: false, problem: 'message-empty' });
    }
    expect(validateFeedback({ message: 'x'.repeat(FEEDBACK_MAX_CHARS) }).ok).toBe(true);
    expect(validateFeedback({ message: 'x'.repeat(FEEDBACK_MAX_CHARS + 1) })).toEqual({ ok: false, problem: 'message-long' });
  });

  it('email, when given, is ≤ 200 and email-shaped', () => {
    expect(validateFeedback({ message: 'hi', email: 'not-an-email' })).toEqual({ ok: false, problem: 'email-shape' });
    const long = `${'a'.repeat(FEEDBACK_EMAIL_MAX_CHARS)}@b.co`;
    expect(validateFeedback({ message: 'hi', email: long })).toEqual({ ok: false, problem: 'email-long' });
    expect(EMAIL_SHAPE.test('a@b.co')).toBe(true);
  });
});

describe('context', () => {
  it('keeps a known source and a pack-id-shaped pack; drops everything else', () => {
    expect(cleanContext({ from: 'email', pack: 'local-2026-10-02-pro1', extra: 'x' })).toEqual({ from: 'email', pack: 'local-2026-10-02-pro1' });
    expect(cleanContext({ from: 'evil', pack: '<script>' })).toEqual({});
    expect(cleanContext('nope')).toEqual({});
    expect(validateFeedback({ message: 'hi', context: { from: 'tv', pack: 'p1' } })).toMatchObject({ ok: true, value: { context: { from: 'tv', pack: 'p1' } } });
  });

  it('feedbackHash and getFeedbackContextFromHash round-trip; other hashes are not the page', () => {
    expect(feedbackHash('landing')).toBe('#/feedback?from=landing');
    expect(feedbackHash('email', 'p1')).toBe('#/feedback?from=email&pack=p1');
    expect(getFeedbackContextFromHash(feedbackHash('email', 'p1'))).toEqual({ from: 'email', pack: 'p1' });
    expect(getFeedbackContextFromHash(FEEDBACK_HASH)).toEqual({});
    expect(getFeedbackContextFromHash('#/feedbackx')).toBeNull();
    expect(getFeedbackContextFromHash('#/pack/p1')).toBeNull();
  });
});

describe('rate limit', () => {
  it(`allows ${RATE_LIMIT_COUNT} per window; the next is limited`, () => {
    expect(isRateLimited(RATE_LIMIT_COUNT - 1)).toBe(false);
    expect(isRateLimited(RATE_LIMIT_COUNT)).toBe(true);
  });
});
