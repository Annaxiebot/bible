/**
 * welcome.test.ts — the trusted welcome request and the function's wiring · 确认邮件请求测试 (ADR-0013)
 *
 * welcomeVerdict reads send-checkins' answers the way the page used to
 * (one attempt = sent; a failed result or anything else = failed with the
 * reason) plus the deliberate skips (site pause, no consent). index.ts is
 * Deno-only, so its CORS preflight, env names and the anon-free wiring
 * are pinned at source level, as for feedback and send-checkins.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { welcomeVerdict, requestWelcome } from '../welcome.ts';

const CONFIG = { supabaseUrl: 'https://p.supabase.co', anonKey: 'anon', cronSecret: 'sec' };

describe('welcomeVerdict', () => {
  it('one attempt with no failure is sent', () => {
    expect(welcomeVerdict(200, { attempted: 1, results: [{ status: 'sent' }] })).toEqual({ status: 'sent' });
    expect(welcomeVerdict(200, { attempted: 1, results: [{ status: 'dry-run' }] })).toEqual({ status: 'sent' });
  });

  it('a site pause or a single skipped row (consent unticked) is skipped, with the reason', () => {
    expect(welcomeVerdict(200, { skipped: 'paused-site' })).toEqual({ status: 'skipped', message: 'paused-site' });
    expect(welcomeVerdict(200, { attempted: 0, skipped: [{ reason: 'no-consent' }], results: [] }))
      .toEqual({ status: 'skipped', message: 'no-consent' });
  });

  it('a failed result, a non-2xx reply, or an unexpected shape is failed with the reason', () => {
    expect(welcomeVerdict(200, { attempted: 1, results: [{ status: 'failed', error: 'Resend 422' }] })).toEqual({ status: 'failed', message: 'Resend 422' });
    expect(welcomeVerdict(403, { error: 'nope' })).toEqual({ status: 'failed', message: 'HTTP 403: nope' });
    expect(welcomeVerdict(200, null)).toEqual({ status: 'failed', message: 'null' });
  });

  it('a network error is failed with its message (never thrown)', async () => {
    const outcome = await requestWelcome(async () => { throw new Error('connection reset'); }, CONFIG, 'id-1');
    expect(outcome).toEqual({ status: 'failed', message: 'connection reset' });
  });

  it('missing configuration fails before any request', async () => {
    let called = false;
    const fetchFn = async () => { called = true; return new Response('{}'); };
    expect(await requestWelcome(fetchFn, { ...CONFIG, anonKey: '' }, 'id-1')).toMatchObject({ status: 'failed' });
    expect(called).toBe(false);
  });
});

describe('signup index.ts wiring (source-level; Deno-only file)', () => {
  const dir = path.resolve(__dirname, '..');
  const source = readFileSync(path.join(dir, 'index.ts'), 'utf-8');
  const serve = source.slice(source.indexOf('Deno.serve('));

  it('answers the CORS preflight first, then hands POST bodies to handleSignup; every reply carries the CORS headers', () => {
    expect(serve.indexOf("request.method === 'OPTIONS'")).toBeLessThan(serve.indexOf('handleSignup('));
    expect(serve).toContain('return preflightResponse(origin);');
    expect(serve.match(/withCors\(/g)).toHaveLength(2);
  });

  it('runs with the service role, salts with IP_HASH_SALT and asks for the welcome with CHECKIN_CRON_SECRET + the anon key', () => {
    expect(source).toContain("createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))");
    expect(source).toContain("salt: env('IP_HASH_SALT')");
    expect(source).toContain("cronSecret: env('CHECKIN_CRON_SECRET')");
    expect(source).toContain("anonKey: env('SUPABASE_ANON_KEY')");
    expect(source).toContain('rpc(MARK_REPLACED_FN, { p_new_id: signupId })');
    expect(source).toContain(".select('id, leader_id, title, pack').eq('id', packId)");
  });

  it('is pinned verify_jwt = false in supabase/config.toml (members never sign in)', () => {
    const config = readFileSync(path.resolve(dir, '../../config.toml'), 'utf-8');
    expect(config).toMatch(/\[functions\.signup\]\s*\nverify_jwt = false/);
  });
});
