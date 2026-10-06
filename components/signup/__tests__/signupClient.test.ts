/**
 * signupClient.test.ts — validation, the request body, client resolution, the one call · 报名数据层测试
 *
 * The Supabase client is mocked; the assertions are on what would be sent
 * and on how the function's answers become what the page shows. A sign-up
 * is a commitment: at least one practice is required before anything else.
 * The browser sends no leader_id, title or id (ADR-0013).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FunctionsFetchError, FunctionsHttpError, SupabaseClient } from '@supabase/supabase-js';
import {
  validateSignup, validatePractice, getSignupClient, practiceLines, EMPTY_SIGNUP, ownVersionOf, toSignupBody, submitSignup, SignupForm,
} from '../signupClient';
import {
  SU_ERR_NAME, SU_ERR_EMAIL_REQUIRED, SU_ERR_EMAIL, SU_ERR_PHONE, SU_ERR_SUBMIT, SU_ERR_PRACTICE, SU_REPLACE_FAILED,
} from '../signupStrings';
import { CK_WELCOME_FAILED } from '../../checkin/checkinStrings';
import { signupEmailKey, isLive } from '../../../supabase/functions/send-checkins/replaced';
import { SIGNUP_FUNCTION, SIGNUP_PROBLEM_TEXT, normalizePhone, validateSignupBody } from '../../../supabase/functions/_shared/signup';

const PACK_ID = '2026-10-02-matt6';
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
    // Email is the check-in channel: phone-only is not accepted; email without phone is.
    expect(validateSignup({ ...valid, phone: '+1 408 555 1234', email: '' })).toBe(SU_ERR_EMAIL_REQUIRED);
    expect(validateSignup({ ...valid, phone: '', email: 'a@b.co' })).toBeNull();
  });

  it('uses the function\'s own limits and lines (one copy): a too-long own version is refused before any call', () => {
    expect(validateSignup({ ...valid, note: 'v'.repeat(501) })).toBe(SIGNUP_PROBLEM_TEXT['note-long']);
    expect(validateSignup({ ...valid, name: 'n'.repeat(101) })).toBe(SIGNUP_PROBLEM_TEXT['name-long']);
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

describe('toSignupBody', () => {
  it('carries what the member typed and chose (tap order) and nothing about ownership; the function accepts it', () => {
    const body = toSignupBody(PACK_ID, { ...valid, practices: [WORK, HEALTH], note: ' 十点关机 ', consent: false });
    expect(body).toEqual({
      pack_id: PACK_ID, name: ' 小明 ', email: ' ming@example.org ', phone: '(408) 555-1234',
      practices: [WORK, HEALTH], practice_note: ' 十点关机 ', consent: false,
    });
    expect(Object.keys(body)).not.toContain('leader_id');
    expect(validateSignupBody(body).ok).toBe(true);
  });
});

describe('submitSignup', () => {
  function fakeClient(reply: { data: unknown; error: Error | null }) {
    const invoke = vi.fn(async () => reply);
    return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke };
  }

  it('one call to the signup function; the id, the replace count and the welcome verdict come back', async () => {
    const { client, invoke } = fakeClient({ data: { id: 'id-1', replaced: 1, replace: 'done', welcome: 'sent' }, error: null });
    expect(await submitSignup(client, PACK_ID, valid)).toEqual({ id: 'id-1', replace: { status: 'done', replaced: 1 }, welcome: { status: 'sent' } });
    expect(invoke).toHaveBeenCalledWith(SIGNUP_FUNCTION, { body: toSignupBody(PACK_ID, valid) });
  });

  it('a failed replace or welcome is returned with its bilingual prefix and the reason (never thrown, never swallowed)', async () => {
    const { client } = fakeClient({
      data: { id: 'id-1', replaced: null, replace: 'failed', replace_message: 'boom', welcome: 'failed', welcome_message: 'Resend 422' }, error: null,
    });
    expect(await submitSignup(client, PACK_ID, valid)).toEqual({
      id: 'id-1',
      replace: { status: 'failed', message: `${SU_REPLACE_FAILED}: boom` },
      welcome: { status: 'failed', message: `${CK_WELCOME_FAILED}: Resend 422` },
    });
    const skipped = fakeClient({ data: { id: 'id-2', replaced: 0, replace: 'done', welcome: 'skipped', welcome_message: 'no-consent' }, error: null });
    expect((await submitSignup(skipped.client, PACK_ID, valid)).welcome).toEqual({ status: 'skipped' });
  });

  it('a refusal throws the bilingual submit error with the function\'s own line (e.g. the 429)', async () => {
    const response = new Response(JSON.stringify({ error: 'rate-limited', message: SIGNUP_PROBLEM_TEXT['rate-limited'] }), { status: 429 });
    const { client } = fakeClient({ data: null, error: new FunctionsHttpError(response) });
    await expect(submitSignup(client, PACK_ID, valid)).rejects.toThrow(`${SU_ERR_SUBMIT}: ${SIGNUP_PROBLEM_TEXT['rate-limited']}`);
  });

  it('a non-JSON refusal shows its status; a network failure its message; a 200 without an id is an error', async () => {
    const http = fakeClient({ data: null, error: new FunctionsHttpError(new Response('gateway', { status: 502 })) });
    await expect(submitSignup(http.client, PACK_ID, valid)).rejects.toThrow(`${SU_ERR_SUBMIT}: HTTP 502`);
    const offline = fakeClient({ data: null, error: new FunctionsFetchError(new TypeError('offline')) });
    await expect(submitSignup(offline.client, PACK_ID, valid)).rejects.toThrow(SU_ERR_SUBMIT);
    const odd = fakeClient({ data: { ok: true }, error: null });
    await expect(submitSignup(odd.client, PACK_ID, valid)).rejects.toThrow(`${SU_ERR_SUBMIT}: {"ok":true}`);
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

describe('replaced rows (one person, one row)', () => {
  it('the email key matches the SQL lower(trim(email)); rows without replaced_at are live', () => {
    expect(signupEmailKey(' Ming@Example.ORG ')).toBe('ming@example.org');
    expect(signupEmailKey(null)).toBe('');
    expect(isLive({})).toBe(true);
    expect(isLive({ replaced_at: null })).toBe(true);
    expect(isLive({ replaced_at: '2026-10-04T00:00:00Z' })).toBe(false);
  });
});
