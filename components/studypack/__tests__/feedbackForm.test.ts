/**
 * feedbackForm.test.ts — Google Form URL rules + prefill encoding · 反馈表测试
 *
 * Also pins the edge function's copy of prefillFormUrl (Deno cannot import
 * this module) to byte-identical output, including Chinese practice text.
 */
import { describe, it, expect } from 'vitest';
import { isGoogleFormUrl, isFormEntryId, prefillFormUrl } from '../feedbackForm';
import { prefillFormUrl as fnPrefillFormUrl } from '../../../supabase/functions/send-checkins/templates.ts';
import { checkinLink } from '../../checkin/checkinLink';
import { parseStudyPack } from '../packTypes';
import { readFileSync } from 'fs';
import { TEST_PACK_PATH } from './fixtures';

const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSd_abc/viewform';
const sample = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';

describe('feedbackForm', () => {
  it('accepts only docs.google.com/forms https URLs and entry.<digits> ids', () => {
    expect(isGoogleFormUrl(FORM)).toBe(true);
    expect(isGoogleFormUrl(` ${FORM} `)).toBe(true);
    expect(isGoogleFormUrl('http://docs.google.com/forms/d/x')).toBe(false);
    expect(isGoogleFormUrl('https://example.com/forms/d/x')).toBe(false);
    expect(isGoogleFormUrl('')).toBe(false);
    expect(isFormEntryId('entry.123456')).toBe(true);
    expect(isFormEntryId('123456')).toBe(false);
  });

  it('prefills name + practice with the given entry ids, percent-encoding Chinese; no ids → the plain form', () => {
    const values = { name: '小明', practice: '把忧虑写下来 · Write the worry down' };
    const url = prefillFormUrl(FORM, { name: 'entry.1', practice: 'entry.2' }, values);
    expect(url.startsWith(`${FORM}?`)).toBe(true);
    const params = new URL(url).searchParams;
    expect(params.get('entry.1')).toBe('小明');
    expect(params.get('entry.2')).toBe(values.practice);
    expect(params.get('usp')).toBe('pp_url');
    expect(url).toContain('%E5%B0%8F%E6%98%8E');
    expect(prefillFormUrl(FORM, { practice: 'entry.2' }, values)).not.toContain('entry.1');
    expect(prefillFormUrl(FORM, undefined, values)).toBe(FORM);
    expect(prefillFormUrl(`${FORM}?usp=sf_link`, { name: 'entry.1' }, values)).toContain('?usp=sf_link&entry.1=');
  });

  it('the edge function copy produces byte-identical links (R3 pin across the Deno boundary)', () => {
    const values = { name: 'Ann "A" Lee', practice: '健康 Health：睡前程序 & 读太6:34' };
    for (const entries of [undefined, { name: 'entry.9' }, { name: 'entry.1', practice: 'entry.2' }]) {
      expect(fnPrefillFormUrl(FORM, entries, values)).toBe(prefillFormUrl(FORM, entries, values));
    }
  });

  it('checkinLink: the form (prefilled) when the pack has one, else the in-app check-in page', () => {
    const withForm = { ...sample, feedbackFormUrl: FORM, feedbackFormEntries: { practice: 'entry.2' } };
    const link = checkinLink({ pack: withForm, signupId: ID, name: 'A', practice: '操练' }, 'https://x.org', '/');
    expect(link).toBe(prefillFormUrl(FORM, { practice: 'entry.2' }, { name: 'A', practice: '操练' }));
    const inApp = checkinLink({ pack: sample, signupId: ID, kind: 'tue', name: 'A', practice: '操练' }, 'https://x.org', '/bible/');
    expect(inApp).toBe(`https://x.org/bible/#/checkin/${ID}/tue`);
  });

  it('parseStudyPack validates the optional form fields', () => {
    expect(parseStudyPack({ ...sample, feedbackFormUrl: FORM }).feedbackFormUrl).toBe(FORM);
    expect(() => parseStudyPack({ ...sample, feedbackFormUrl: 'https://example.com' })).toThrow('feedbackFormUrl');
    expect(() => parseStudyPack({ ...sample, feedbackFormUrl: FORM, feedbackFormEntries: { name: '12' } })).toThrow('entry.123456');
    expect(parseStudyPack({ ...sample, feedbackFormUrl: FORM, feedbackFormEntries: { name: 'entry.12' } }).feedbackFormEntries).toEqual({ name: 'entry.12' });
  });
});
