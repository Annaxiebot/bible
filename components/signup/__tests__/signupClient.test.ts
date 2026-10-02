/**
 * signupClient.test.ts — validation, payload, client resolution, insert · 报名数据层测试
 *
 * The Supabase client is mocked; the assertions are on what would be sent.
 * A sign-up is a commitment: the practice is required before anything else.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateSignup, validatePractice, toInsertPayload, normalizePhone, insertSignup, getSignupClient, practiceLine, EMPTY_SIGNUP,
  SIGNUPS_TABLE, SIGNUP_LOCALE, SignupForm,
} from '../signupClient';
import { SIGNUP_RETURNING } from '../signupSchema';
import {
  SU_ERR_NAME, SU_ERR_CONTACT, SU_ERR_EMAIL, SU_ERR_PHONE, SU_ERR_SUBMIT, SU_DEMO_LINE, SU_ERR_PRACTICE,
} from '../signupStrings';

const OWNED = { id: '2026-10-02-matt6', title: '不要忧虑', leaderId: 'uid-lead' };
const HEALTH = { area: '健康 Health', practice: '睡前程序 · Wind-down' };
const WORK = { area: '工作 Work', practice: '写下忧虑 · Write it down' };

const valid: SignupForm = {
  ...EMPTY_SIGNUP, practice: HEALTH, name: ' 小明 ', phone: '(408) 555-1234', email: ' ming@example.org ', consent: true,
};

describe('validateSignup', () => {
  it('requires a practice first, then a name and a contact; bilingual message for each problem', () => {
    expect(validateSignup(valid)).toBeNull();
    expect(validatePractice({ practice: null })).toBe(SU_ERR_PRACTICE);
    expect(validateSignup({ ...valid, practice: null })).toBe(SU_ERR_PRACTICE);
    expect(validateSignup({ ...valid, name: '  ' })).toBe(SU_ERR_NAME);
    expect(validateSignup({ ...valid, phone: '', email: '' })).toBe(SU_ERR_CONTACT);
    expect(validateSignup({ ...valid, email: 'not-an-email' })).toBe(SU_ERR_EMAIL);
    expect(validateSignup({ ...valid, phone: '12' })).toBe(SU_ERR_PHONE);
    expect(validateSignup({ ...valid, phone: '+1 408 555 1234', email: '' })).toBeNull();
    expect(validateSignup({ ...valid, phone: '', email: 'a@b.co' })).toBeNull();
  });

  it('normalizePhone strips formatting but keeps the leading +', () => {
    expect(normalizePhone('+1 (408) 555-1234')).toBe('+14085551234');
  });

  it('practiceLine: the own version when written, else the chosen menu text', () => {
    expect(practiceLine(valid)).toBe(HEALTH.practice);
    expect(practiceLine({ ...valid, note: ' 十点关机 ' })).toBe('十点关机');
    expect(practiceLine({ practice: null, note: '' })).toBe('');
  });
});

describe('toInsertPayload', () => {
  it('trims, nulls empty optionals, carries pack id + title + the owning leader_id, consent, locale and the commitment', () => {
    expect(toInsertPayload(OWNED, valid)).toEqual({
      pack_id: '2026-10-02-matt6', leader_id: 'uid-lead', pack_title: '不要忧虑', name: '小明',
      phone: '4085551234', email: 'ming@example.org', consent_checkins: true, locale: SIGNUP_LOCALE,
      practice_area: HEALTH.area, practice_text: HEALTH.practice, practice2_area: null, practice2_text: null, practice_note: null,
    });
    const full = toInsertPayload(OWNED, { ...valid, second: WORK, note: ' 十点关机 ', phone: '', consent: false });
    expect(full).toMatchObject({
      phone: null, consent_checkins: false, practice2_area: WORK.area, practice2_text: WORK.practice, practice_note: '十点关机',
    });
  });

  it('refuses a demo pack (no leaderId) and a form without a practice', () => {
    expect(() => toInsertPayload({ id: 'p', title: 't' }, valid)).toThrow(SU_DEMO_LINE);
    expect(() => toInsertPayload(OWNED, { ...valid, practice: null })).toThrow(SU_ERR_PRACTICE);
  });
});

describe('insertSignup', () => {
  function fakeClient(result: { data: unknown; error: { message: string } | null }) {
    const single = vi.fn(async () => result);
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    return { client: { from } as unknown as SupabaseClient, from, insert, select };
  }

  it('inserts into study_signups, asks for the new id back, and resolves with it', async () => {
    const { client, from, insert, select } = fakeClient({ data: { id: 'uuid-1' }, error: null });
    const payload = toInsertPayload(OWNED, valid);
    expect(await insertSignup(client, payload)).toBe('uuid-1');
    expect(from).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(insert).toHaveBeenCalledWith(payload);
    expect(select).toHaveBeenCalledWith(SIGNUP_RETURNING);
  });

  it('throws the bilingual submit error with the PostgREST message, or when no id comes back (never silent)', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'new row violates row-level security policy' } });
    await expect(insertSignup(client, toInsertPayload(OWNED, valid)))
      .rejects.toThrow(`${SU_ERR_SUBMIT}: new row violates row-level security policy`);
    await expect(insertSignup(fakeClient({ data: {}, error: null }).client, toInsertPayload(OWNED, valid)))
      .rejects.toThrow(`${SU_ERR_SUBMIT}: no id returned`);
  });
});

describe('getSignupClient', () => {
  afterEach(() => { delete (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__; });

  it('is null without VITE_SUPABASE_* and without the dev override', () => {
    expect(getSignupClient()).toBeNull();
  });

  it('builds a client from window.__SUPABASE_E2E__ (url + anonKey) and reuses it', () => {
    (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__ = { url: 'https://e2e.invalid', anonKey: 'anon' };
    const client = getSignupClient();
    expect(client).not.toBeNull();
    expect(getSignupClient()).toBe(client);
  });
});
