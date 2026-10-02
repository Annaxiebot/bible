/**
 * signupClient.test.ts — validation, payload, client resolution, insert · 报名数据层测试
 *
 * The Supabase client is mocked; the assertions are on what would be sent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateSignup, toInsertPayload, normalizePhone, insertSignup, getSignupClient, SIGNUPS_TABLE, SIGNUP_LOCALE,
} from '../signupClient';
import { SU_ERR_NAME, SU_ERR_CONTACT, SU_ERR_EMAIL, SU_ERR_PHONE, SU_ERR_SUBMIT, SU_DEMO_LINE } from '../signupStrings';

const OWNED = { id: '2026-10-02-matt6', title: '不要忧虑', leaderId: 'uid-lead' };

const valid = { name: ' 小明 ', phone: '(408) 555-1234', email: ' ming@example.org ', consent: true };

describe('validateSignup', () => {
  it('returns null for a valid form and a bilingual message for each problem, name first', () => {
    expect(validateSignup(valid)).toBeNull();
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
});

describe('toInsertPayload', () => {
  it('trims, nulls empty optionals, carries pack id + title + the owning leader_id, consent and locale', () => {
    expect(toInsertPayload(OWNED, valid)).toEqual({
      pack_id: '2026-10-02-matt6', leader_id: 'uid-lead', pack_title: '不要忧虑', name: '小明',
      phone: '4085551234', email: 'ming@example.org', consent_checkins: true, locale: SIGNUP_LOCALE,
    });
    const minimal = toInsertPayload(OWNED, { name: 'A', phone: '', email: 'a@b.co', consent: false });
    expect(minimal.phone).toBeNull();
    expect(minimal.consent_checkins).toBe(false);
  });

  it('refuses a demo pack (no leaderId): there is nobody to own the row', () => {
    expect(() => toInsertPayload({ id: 'p', title: 't' }, valid)).toThrow(SU_DEMO_LINE);
  });
});

describe('insertSignup', () => {
  function fakeClient(result: { error: { message: string } | null }) {
    const insert = vi.fn(async () => result);
    const from = vi.fn(() => ({ insert }));
    return { client: { from } as unknown as SupabaseClient, from, insert };
  }

  it('inserts into study_signups and resolves', async () => {
    const { client, from, insert } = fakeClient({ error: null });
    const payload = toInsertPayload(OWNED, valid);
    await insertSignup(client, payload);
    expect(from).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(insert).toHaveBeenCalledWith(payload);
  });

  it('throws the bilingual submit error with the PostgREST message (never silent)', async () => {
    const { client } = fakeClient({ error: { message: 'new row violates row-level security policy' } });
    await expect(insertSignup(client, toInsertPayload(OWNED, valid)))
      .rejects.toThrow(`${SU_ERR_SUBMIT}: new row violates row-level security policy`);
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
