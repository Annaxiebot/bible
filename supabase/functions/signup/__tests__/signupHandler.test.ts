/**
 * signupHandler.test.ts — the signup function's decisions, with fakes · 报名函数测试 (ADR-0013)
 *
 * The fakes keep the real constraints: the store counts by ip_hash inside
 * the window like the live query and refuses inserts exactly as the
 * study_signups_rate_guard trigger does (caps and messages read from its
 * SQL, tests/utils/signupRateGuard), the replace marks rows as
 * mark_replaced_signups does, and the welcome goes
 * through the real requestWelcome to a fake send-checkins that, like the
 * real one, refuses a caller without the trusted header.
 */
import { describe, it, expect } from 'vitest';
import { handleSignup, SignupDeps, SignupRow, PackRow, RateGuardError } from '../signupHandler.ts';
import { requestWelcome, WelcomeConfig } from '../welcome.ts';
import { hashClientIp } from '../../_shared/clientIp.ts';
import { SIGNUP_PROBLEM_TEXT, SIGNUP_IP_LIMIT, SIGNUP_LOCALE } from '../../_shared/signup.ts';
import { signupEmailKey } from '../../send-checkins/replaced.ts';
import {
  rateGuardRefusal, RATE_GUARD_PER_PACK_HOUR, RATE_GUARD_PER_EMAIL_DAY, RATE_GUARD_PACK_MESSAGE, RATE_GUARD_EMAIL_MESSAGE,
} from '../../../../tests/utils/signupRateGuard';
import { CRON_SECRET_HEADER, isTrustedCaller, welcomeCallerProblem } from '../../send-checkins/trust.ts';

const NOW = new Date('2026-10-06T12:00:00Z');
const IP = '203.0.113.7';
const SECRET = 'cron-secret';
const LEADER = 'uid-real-leader';
const WORK = { area: '工作 Work', practice: '写下忧虑 · Write it down' };
const HEALTH = { area: '健康 Health', practice: '睡前程序 · Wind-down' };
const PACK: PackRow = {
  id: 'local-2026-10-02-matt6', leader_id: LEADER, title: '不要忧虑 Do Not Be Anxious',
  pack: { sections: [{ kind: 'title' }, { kind: 'lifeMenu', rows: [HEALTH, WORK] }, { kind: 'lifeMenu', rows: [{ area: 'X', practice: 'later menu' }] }] },
};
const BODY = {
  pack_id: PACK.id, name: ' 小明 ', email: ' Ming@Example.org ', phone: '(408) 555-1234',
  practices: [WORK], practice_note: ' 十点关机 ', consent: true,
};
const WELCOME: WelcomeConfig = { supabaseUrl: 'https://proj.supabase.co/', anonKey: 'anon-key', cronSecret: SECRET };

type Stored = SignupRow & { created_at: string; replaced_at: string | null };

/** A fake send-checkins: the same trusted-caller gate, then one welcome. */
function fakeSendCheckins(reply: { status: number; body: unknown } = { status: 200, body: { attempted: 1, results: [{ status: 'sent' }] } }) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchFn = async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url, headers, body: JSON.parse(String(init.body)) });
    const refused = welcomeCallerProblem(headers[CRON_SECRET_HEADER] ?? null, SECRET);
    if (refused) return new Response(JSON.stringify({ error: refused }), { status: 403 });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  };
  return { calls, fetchFn };
}

function setup(over: Partial<SignupDeps> = {}, packs: PackRow[] = [PACK], welcomeConfig = WELCOME) {
  const rows: Stored[] = [];
  const welcome = fakeSendCheckins();
  let next = 0;
  const deps: SignupDeps = {
    salt: 'test-salt',
    now: () => NOW,
    newId: () => `id-${++next}`,
    countByIp: async (ipHash, since) => rows.filter(r => r.ip_hash === ipHash && r.created_at >= since).length,
    loadPack: async id => packs.find(p => p.id === id) ?? null,
    insert: async row => {
      const refused = rateGuardRefusal(rows, row, NOW);
      if (refused) throw new RateGuardError(refused);
      rows.push({ ...row, created_at: NOW.toISOString(), replaced_at: null });
    },
    markReplaced: async id => {
      const fresh = rows.find(r => r.id === id && !r.replaced_at);
      if (!fresh) throw new Error(`sign-up ${id} not found`);
      const earlier = rows.filter(r => r !== fresh && !r.replaced_at && r.pack_id === fresh.pack_id
        && signupEmailKey(r.email) === signupEmailKey(fresh.email) && r.created_at <= fresh.created_at);
      for (const r of earlier) r.replaced_at = NOW.toISOString();
      return earlier.length;
    },
    sendWelcome: id => requestWelcome(welcome.fetchFn, welcomeConfig, id),
    ...over,
  };
  return { rows, deps, welcome };
}

const post = (body: unknown, deps: SignupDeps, ip = IP) => handleSignup('POST', body, ip, deps);

describe('handleSignup: method and validation (nothing written)', () => {
  it('only POST (405)', async () => {
    const { rows, deps } = setup();
    expect((await handleSignup('GET', null, IP, deps)).status).toBe(405);
    expect(rows).toHaveLength(0);
  });

  it.each([
    ['no practice', { practices: [] }, 'practice-none'],
    ['21 practices', { practices: Array(21).fill(WORK) }, 'practice-many'],
    ['a 301-char practice', { practices: [{ area: 'a', practice: 'x'.repeat(301) }] }, 'practice-long'],
    ['no name', { name: '  ' }, 'name-empty'],
    ['a 101-char name', { name: 'n'.repeat(101) }, 'name-long'],
    ['no email', { email: '' }, 'email-empty'],
    ['a 201-char email', { email: `${'e'.repeat(195)}@x.org` }, 'email-long'],
    ['a malformed email', { email: 'not-an-email' }, 'email-shape'],
    ['a short phone', { phone: '12' }, 'phone-shape'],
    ['a 501-char own version', { practice_note: 'v'.repeat(501) }, 'note-long'],
    ['no pack id', { pack_id: '' }, 'incomplete'],
    ['no consent flag', { consent: undefined }, 'incomplete'],
    ['practices not a list', { practices: 'work' }, 'incomplete'],
  ] as const)('%s → 400 with the bilingual line', async (_label, patch, problem) => {
    const { rows, deps, welcome } = setup();
    const reply = await post({ ...BODY, ...patch }, deps);
    expect(reply).toEqual({ status: 400, body: { error: problem, message: SIGNUP_PROBLEM_TEXT[problem] } });
    expect(rows).toHaveLength(0);
    expect(welcome.calls).toHaveLength(0);   // no email, no row → no welcome is ever asked for
  });

  it('a missing salt is a 500 before anything is written', async () => {
    const { rows, deps } = setup({ salt: '' });
    expect((await post(BODY, deps)).status).toBe(500);
    expect(rows).toHaveLength(0);
  });
});

describe('handleSignup: rate limits (429, bilingual)', () => {
  const OTHER: PackRow = { ...PACK, id: 'local-other' };

  it(`the ${SIGNUP_IP_LIMIT + 1}th sign-up from one IP in an hour is refused (the handler's own cap); another IP still gets in`, async () => {
    const { rows, deps } = setup({}, [PACK, OTHER]);
    for (let i = 0; i < SIGNUP_IP_LIMIT; i++) {
      expect((await post({ ...BODY, pack_id: i % 2 ? PACK.id : OTHER.id, email: `m${i}@example.org` }, deps)).status).toBe(200);
    }
    const reply = await post({ ...BODY, email: 'late@example.org' }, deps);
    expect(reply).toEqual({ status: 429, body: { error: 'rate-limited', message: SIGNUP_PROBLEM_TEXT['rate-limited'] } });
    expect(rows).toHaveLength(SIGNUP_IP_LIMIT);
    expect((await post({ ...BODY, email: 'late@example.org' }, deps, '198.51.100.1')).status).toBe(200);
  });

  it(`the trigger's per pack + email cap (${RATE_GUARD_PER_EMAIL_DAY}/day, case/space-insensitive) is a 429 with the trigger's own line`, async () => {
    const { rows, deps, welcome } = setup();
    for (let i = 0; i < RATE_GUARD_PER_EMAIL_DAY; i++) {
      expect((await post({ ...BODY, email: i % 2 ? 'ming@example.org' : ' MING@example.ORG' }, deps, `10.0.0.${i}`)).status).toBe(200);
    }
    expect(await post(BODY, deps, '10.0.1.1')).toEqual({ status: 429, body: { error: 'rate-limited', message: RATE_GUARD_EMAIL_MESSAGE } });
    expect(rows).toHaveLength(RATE_GUARD_PER_EMAIL_DAY);
    expect(welcome.calls).toHaveLength(RATE_GUARD_PER_EMAIL_DAY);   // a refused row asks for no welcome
  });

  it(`the trigger's per-pack cap (${RATE_GUARD_PER_PACK_HOUR}/hour) is a 429 with the trigger's own line`, async () => {
    const { deps } = setup();
    for (let i = 0; i < RATE_GUARD_PER_PACK_HOUR; i++) await post({ ...BODY, email: `p${i}@example.org` }, deps, `10.1.${i}.1`);
    expect((await post(BODY, deps, '10.2.0.1')).body).toEqual({ error: 'rate-limited', message: RATE_GUARD_PACK_MESSAGE });
  });

  it('any other insert failure is thrown (index.ts answers 500 with the reason), not dressed up as a rate limit', async () => {
    const { deps } = setup({ insert: async () => { throw new Error('sign-up insert failed: boom'); } });
    await expect(post(BODY, deps)).rejects.toThrow('boom');
  });
});

describe('handleSignup: the pack decides ownership and the menu', () => {
  it('an unknown pack is a 404 (bilingual); nothing is written', async () => {
    const { rows, deps } = setup();
    expect(await post({ ...BODY, pack_id: 'local-nope' }, deps))
      .toEqual({ status: 404, body: { error: 'pack-unknown', message: SIGNUP_PROBLEM_TEXT['pack-unknown'] } });
    expect(rows).toHaveLength(0);
  });

  it('a practice that is not a row of the pack\'s (first) life menu is a 400; a changed text or area counts as unknown', async () => {
    const { rows, deps } = setup();
    for (const practices of [[{ area: 'X', practice: 'later menu' }], [{ ...WORK, practice: `${WORK.practice}!` }], [WORK, { ...HEALTH, area: '工作 Work' }]]) {
      expect((await post({ ...BODY, practices }, deps)).body).toEqual({ error: 'practice-unknown', message: SIGNUP_PROBLEM_TEXT['practice-unknown'] });
    }
    expect(rows).toHaveLength(0);
  });

  it('leader_id and pack_title come from study_packs, never the body; the client\'s id and ip_hash are ignored', async () => {
    const { rows, deps } = setup();
    const spoof = { ...BODY, leader_id: 'uid-attacker', pack_title: 'spoofed', id: 'client-id', ip_hash: 'client-hash', locale: 'en' };
    const reply = await post(spoof, deps);
    expect(reply.status).toBe(200);
    expect(reply.body.id).toBe('id-1');
    expect(rows[0]).toMatchObject({ id: 'id-1', leader_id: LEADER, pack_title: PACK.title, locale: SIGNUP_LOCALE });
  });

  it('the inserted row: trimmed fields, normalised phone, the practice columns, consent, and the salted ip_hash', async () => {
    const { rows, deps } = setup();
    await post({ ...BODY, practices: [HEALTH, WORK], consent: false }, deps);
    const { created_at: _c, replaced_at: _r, ...row } = rows[0];
    expect(row).toEqual({
      id: 'id-1', pack_id: PACK.id, leader_id: LEADER, pack_title: PACK.title, name: '小明', phone: '4085551234',
      email: 'Ming@Example.org', consent_checkins: false, locale: SIGNUP_LOCALE,
      practices: [HEALTH, WORK], practice_area: HEALTH.area, practice_text: HEALTH.practice,
      practice2_area: WORK.area, practice2_text: WORK.practice, practice_note: '十点关机',
      ip_hash: await hashClientIp('test-salt', IP),
    });
    expect(row.ip_hash).not.toContain(IP);
  });
});

describe('handleSignup: after the insert', () => {
  it('a clean first sign-up: 200, nothing replaced, the welcome sent — with the trusted header to send-checkins', async () => {
    const { deps, welcome } = setup();
    expect(await post(BODY, deps)).toEqual({ status: 200, body: { id: 'id-1', replaced: 0, replace: 'done', welcome: 'sent' } });
    expect(welcome.calls).toEqual([{
      url: 'https://proj.supabase.co/functions/v1/send-checkins',
      headers: { 'Content-Type': 'application/json', apikey: 'anon-key', Authorization: 'Bearer anon-key', [CRON_SECRET_HEADER]: SECRET },
      body: { kind: 'welcome', signup_id: 'id-1' },
    }]);
    expect(isTrustedCaller(welcome.calls[0].headers[CRON_SECRET_HEADER], SECRET)).toBe(true);
  });

  it('signing up again replaces the earlier row (count returned)', async () => {
    const { rows, deps } = setup();
    await post(BODY, deps);
    expect((await post({ ...BODY, email: 'ming@example.org' }, deps)).body).toMatchObject({ id: 'id-2', replaced: 1, replace: 'done' });
    expect(rows.map(r => Boolean(r.replaced_at))).toEqual([true, false]);
  });

  it('a failed replace is still a 200 (the row is stored) with replace: failed and the reason; the welcome still goes', async () => {
    const { rows, deps, welcome } = setup({ markReplaced: async () => { throw new Error('function not found'); } });
    expect((await post(BODY, deps)).body).toEqual({
      id: 'id-1', replaced: null, replace: 'failed', replace_message: 'function not found', welcome: 'sent',
    });
    expect(rows).toHaveLength(1);
    expect(welcome.calls).toHaveLength(1);
  });

  it('a refused welcome (no secret configured → no trusted header) is welcome: failed with the reason, still 200', async () => {
    const { deps, welcome } = setup({}, [PACK], { ...WELCOME, cronSecret: '' });
    const reply = await post(BODY, deps);
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ welcome: 'failed', welcome_message: 'CHECKIN_CRON_SECRET is not set' });
    expect(welcome.calls).toHaveLength(0);
  });

  it('a wrong secret reaches send-checkins and is refused (403): welcome failed, with that reason', async () => {
    const { deps } = setup({}, [PACK], { ...WELCOME, cronSecret: 'wrong' });
    expect((await post(BODY, deps)).body).toMatchObject({ welcome: 'failed', welcome_message: expect.stringContaining('HTTP 403') });
  });
});
