/**
 * signupClient.test.ts — validation, payload, client resolution, insert · 报名数据层测试
 *
 * The Supabase client is mocked; the assertions are on what would be sent.
 * A sign-up is a commitment: at least one practice is required before anything else.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  validateSignup, validatePractice, toInsertPayload, normalizePhone, insertSignup, getSignupClient, practiceLines, newSignupId, EMPTY_SIGNUP,
  markReplaced, ownVersionOf,
  SIGNUPS_TABLE, SIGNUP_LOCALE, SignupForm,
} from '../signupClient';
import {
  SU_ERR_NAME, SU_ERR_EMAIL_REQUIRED, SU_ERR_EMAIL, SU_ERR_PHONE, SU_ERR_SUBMIT, SU_DEMO_LINE, SU_ERR_PRACTICE, SU_REPLACE_FAILED,
} from '../signupStrings';
import { MARK_REPLACED_FN, signupEmailKey, isLive } from '../../../supabase/functions/send-checkins/replaced';

const OWNED = { id: '2026-10-02-matt6', title: '不要忧虑', leaderId: 'uid-lead' };
const HEALTH = { area: '健康 Health', practice: '睡前程序 · Wind-down' };
const WORK = { area: '工作 Work', practice: '写下忧虑 · Write it down' };
const FAMILY = { area: '家庭 Family', practice: '一起吃饭 · Eat together' };

const valid: SignupForm = {
  ...EMPTY_SIGNUP, practices: [HEALTH], name: ' 小明 ', phone: '(408) 555-1234', email: ' ming@example.org ', consent: true,
};

describe('validateSignup', () => {
  it('requires at least one practice first, then a name and an email; bilingual message for each problem', () => {
    expect(validateSignup(valid)).toBeNull();
    expect(validatePractice({ practices: [] })).toBe(SU_ERR_PRACTICE);
    expect(validatePractice({ practices: [HEALTH, WORK, FAMILY] })).toBeNull();
    expect(validateSignup({ ...valid, practices: [] })).toBe(SU_ERR_PRACTICE);
    expect(validateSignup({ ...valid, name: '  ' })).toBe(SU_ERR_NAME);
    expect(validateSignup({ ...valid, phone: '', email: '' })).toBe(SU_ERR_EMAIL_REQUIRED);
    expect(validateSignup({ ...valid, email: '   ' })).toBe(SU_ERR_EMAIL_REQUIRED);
    expect(validateSignup({ ...valid, email: 'not-an-email' })).toBe(SU_ERR_EMAIL);
    expect(validateSignup({ ...valid, phone: '12' })).toBe(SU_ERR_PHONE);
    // Email is the check-in channel: phone-only is no longer accepted; email without phone is.
    expect(validateSignup({ ...valid, phone: '+1 408 555 1234', email: '' })).toBe(SU_ERR_EMAIL_REQUIRED);
    expect(validateSignup({ ...valid, phone: '', email: 'a@b.co' })).toBeNull();
  });

  it('normalizePhone strips formatting but keeps the leading +', () => {
    expect(normalizePhone('+1 (408) 555-1234')).toBe('+14085551234');
  });

  it('practiceLines: one per chosen practice in order, each its own text; the own version is a separate line', () => {
    expect(practiceLines(valid)).toEqual([HEALTH.practice]);
    expect(practiceLines({ practices: [HEALTH, WORK, FAMILY], note: '' })).toEqual([HEALTH.practice, WORK.practice, FAMILY.practice]);
    expect(practiceLines({ practices: [HEALTH, WORK], note: ' 十点关机 ' })).toEqual([HEALTH.practice, WORK.practice]);
    expect(ownVersionOf({ note: ' 十点关机 ' })).toBe('我的版本 · My own version：十点关机');
    expect(ownVersionOf({ note: ' ' })).toBeNull();
    expect(practiceLines({ practices: [], note: '' })).toEqual([]);
  });
});

describe('toInsertPayload', () => {
  it('trims, nulls empty optionals, carries pack id + title + the owning leader_id, consent, locale and the commitment', () => {
    expect(toInsertPayload(OWNED, valid, 'id-1')).toEqual({
      id: 'id-1', pack_id: '2026-10-02-matt6', leader_id: 'uid-lead', pack_title: '不要忧虑', name: '小明',
      phone: '4085551234', email: 'ming@example.org', consent_checkins: true, locale: SIGNUP_LOCALE,
      practices: [HEALTH], practice_area: HEALTH.area, practice_text: HEALTH.practice, practice2_area: null, practice2_text: null,
      practice_note: null,
    });
    const full = toInsertPayload(OWNED, { ...valid, practices: [WORK, HEALTH, FAMILY], note: ' 十点关机 ', phone: '', consent: false });
    expect(full).toMatchObject({
      phone: null, consent_checkins: false, practice_note: '十点关机',
      practices: [WORK, HEALTH, FAMILY],                                  // every choice, in tap order
      practice_area: WORK.area, practice_text: WORK.practice,             // legacy first
      practice2_area: HEALTH.area, practice2_text: HEALTH.practice,       // legacy second
    });
  });

  it('carries a fresh RFC 4122 v4 uuid as id by default (the browser makes it; the insert cannot read it back)', () => {
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const a = toInsertPayload(OWNED, valid).id;
    expect(a).toMatch(UUID_V4);
    expect(toInsertPayload(OWNED, valid).id).not.toBe(a);
    const original = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });   // insecure context (http LAN)
    try {
      expect(newSignupId()).toMatch(UUID_V4);
    } finally {
      if (original) Object.defineProperty(crypto, 'randomUUID', original);
      else delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  });

  it('refuses a demo pack (no leaderId) and a form without a practice', () => {
    expect(() => toInsertPayload({ id: 'p', title: 't' }, valid)).toThrow(SU_DEMO_LINE);
    expect(() => toInsertPayload(OWNED, { ...valid, practices: [] })).toThrow(SU_ERR_PRACTICE);
  });
});

describe('insertSignup', () => {
  /** Models the live guard: the plain insert passes; reading the row back (.select → RETURNING) fails RLS for anon. */
  function fakeClient(result: { error: { message: string } | null }) {
    const select = vi.fn(() => ({ single: async () => ({ data: null, error: { message: 'new row violates row-level security policy' } }) }));
    const insert = vi.fn(() => Object.assign(Promise.resolve({ data: null, ...result }), { select }));
    const from = vi.fn(() => ({ insert }));
    return { client: { from } as unknown as SupabaseClient, from, insert, select };
  }

  it('inserts into study_signups WITHOUT reading the row back (no select / RETURNING) and resolves with the payload id', async () => {
    const { client, from, insert, select } = fakeClient({ error: null });
    const payload = toInsertPayload(OWNED, valid);
    expect(await insertSignup(client, payload)).toBe(payload.id);
    expect(from).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(insert).toHaveBeenCalledWith(payload);
    expect(select).not.toHaveBeenCalled();
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

describe('markReplaced (a later sign-up of the same pack + email replaces the earlier)', () => {
  const rpcClient = (reply: { data: unknown; error: { message: string } | null }) => {
    const rpc = vi.fn(async () => reply);
    return { client: { rpc } as unknown as SupabaseClient, rpc };
  };

  it('calls the RPC with only the new id and returns how many earlier rows it replaced', async () => {
    const { client, rpc } = rpcClient({ data: 2, error: null });
    expect(await markReplaced(client, 'new-id')).toEqual({ status: 'done', replaced: 2 });
    expect(rpc).toHaveBeenCalledWith(MARK_REPLACED_FN, { p_new_id: 'new-id' });
  });

  it('a PostgREST error or a non-number reply is a failed result carrying the reason (never thrown, never swallowed)', async () => {
    expect(await markReplaced(rpcClient({ data: null, error: { message: 'boom' } }).client, 'x'))
      .toEqual({ status: 'failed', message: `${SU_REPLACE_FAILED}: boom` });
    expect(await markReplaced(rpcClient({ data: { id: 'leak' }, error: null }).client, 'x'))
      .toEqual({ status: 'failed', message: `${SU_REPLACE_FAILED}: {"id":"leak"}` });
  });

  it('the email key matches the SQL lower(trim(email)); rows without replaced_at are live', () => {
    expect(signupEmailKey(' Ming@Example.ORG ')).toBe('ming@example.org');
    expect(signupEmailKey(null)).toBe('');
    expect(isLive({})).toBe(true);
    expect(isLive({ replaced_at: null })).toBe(true);
    expect(isLive({ replaced_at: '2026-10-04T00:00:00Z' })).toBe(false);
  });
});
