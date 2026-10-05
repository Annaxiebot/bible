/**
 * optout.test.ts — the three levels of "stop" in the sender · 退订与暂停单元测试 (ADR-0009)
 *
 * Recipients skip stopped rows (welcome included); every member email ends
 * with the stop line and carries both List-Unsubscribe headers; the
 * one-click endpoint (POST + exact body + uuid → marks; else 400/404/405);
 * the pause decision (site stops everything, a paused pack still sends
 * the welcome); and the index.ts wiring order, pinned at source level
 * (index.ts is Deno-only).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  isUnsubscribed, pauseSkip, sitePaused, oneClickUrl, listUnsubscribeHeaders, handleOneClick, isOneClickRequest,
  ONE_CLICK_BODY, SEND_CHECKINS_SLUG, SITE_PAUSE_SECRET,
} from '../optout.ts';
import { selectRecipients, SignupRow } from '../recipients.ts';
import { renderCheckin, stopLine, stopPageUrl, SITE_ORIGIN, WELCOME_KIND, CheckinPack } from '../templates.ts';
import { resendBody, EmailConfig } from '../senders.ts';
import { packFromSummary, SUMMARY_COLUMNS } from '../packSource.ts';
import { checkinStopHash } from '../../../../components/checkin/checkinRoute';
import { SEND_CHECKINS_FUNCTION } from '../../../../components/signup/signupSchema';

const ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';
const BASE = 'https://lafipstknsudjtfxbkkn.supabase.co';
const PACK: CheckinPack = {
  id: 'p1', title: 'T', leaderId: 'L', prompts: { tue: 'a · A', thu: 'b · B', weekend: 'c · C' }, feedbackFormUrl: null, feedbackFormEntries: null,
};
const row = (over: Partial<SignupRow>): SignupRow => ({
  id: ID, pack_id: 'p1', leader_id: 'L', name: 'N', phone: null, email: 'n@example.org', consent_checkins: true,
  practice_text: null, practice_note: null, ...over,
});

describe('recipients skip stopped rows', () => {
  it('a stopped row is skipped as "unsubscribed" — the scheduled kinds and the welcome both go through selectRecipients', () => {
    const sel = selectRecipients([row({ unsubscribed_at: '2026-10-04T00:00:00Z' }), row({ id: 'b' })], { smsEnabled: false });
    expect(sel.recipients.map(r => r.signup.id)).toEqual(['b']);
    expect(sel.skipped.map(s => s.reason)).toEqual(['unsubscribed']);
    expect(isUnsubscribed({ unsubscribed_at: null })).toBe(false);
    expect(isUnsubscribed({})).toBe(false);   // rows read before the column existed
  });

  it('existing reasons keep their precedence: replaced first, then unsubscribed, then no-consent', () => {
    const sel = selectRecipients([
      row({ id: 'r', replaced_at: 'x', unsubscribed_at: 'x' }), row({ id: 'u', unsubscribed_at: 'x', consent_checkins: false }), row({ id: 'c', consent_checkins: false }),
    ], { smsEnabled: false });
    expect(sel.skipped.map(s => [s.signup.id, s.reason])).toEqual([['r', 'replaced'], ['u', 'unsubscribed'], ['c', 'no-consent']]);
  });
});

describe('stop line + List-Unsubscribe headers', () => {
  it('every member email (welcome + tue/thu/weekend) ends with the stop line to #/checkin/<id>/stop', () => {
    for (const kind of [WELCOME_KIND, 'tue', 'thu', 'weekend'] as const) {
      const lines = renderCheckin(kind, PACK, { name: 'N', signupId: ID, practices: [] }).text.split('\n');
      expect(lines[lines.length - 1]).toBe(stopLine(ID));
    }
    expect(stopLine(ID)).toBe(`不想再收到？退订 · Stop these emails: ${SITE_ORIGIN}/#/checkin/${ID}/stop`);
    expect(stopPageUrl(ID)).toBe(`${SITE_ORIGIN}/${checkinStopHash(ID)}`);   // the same route the app parses
  });

  it('the leader\'s test (no signup id) has no stop line — there is nothing to stop', () => {
    expect(renderCheckin('tue', PACK, { name: 'L', signupId: null, practices: [] }).text).not.toContain('退订');
  });

  it('resendBody carries List-Unsubscribe <one-click url> and List-Unsubscribe-Post only with a one-click URL', () => {
    const config: EmailConfig = { apiKey: 'k', from: 'f', replyTo: null };
    const url = oneClickUrl(`${BASE}/`, ID);
    expect(url).toBe(`${BASE}/functions/v1/send-checkins?unsubscribe=${ID}`);
    const body = resendBody(config, 'n@example.org', { subject: 's', text: 't', oneClickUrl: url });
    expect(body.headers).toEqual({ 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
    expect(listUnsubscribeHeaders(url)['List-Unsubscribe-Post']).toBe(ONE_CLICK_BODY);
    expect(resendBody(config, 'n@example.org', { subject: 's', text: 't' })).not.toHaveProperty('headers');
  });

  it('the function slug in the one-click URL is the app\'s SEND_CHECKINS_FUNCTION', () => {
    expect(SEND_CHECKINS_SLUG).toBe(SEND_CHECKINS_FUNCTION);
  });
});

describe('handleOneClick (RFC 8058)', () => {
  const post = (query: string, body = ONE_CLICK_BODY, method = 'POST') => new Request(`${BASE}/functions/v1/send-checkins?${query}`, {
    method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'GET' ? undefined : body,
  });

  it('a valid POST marks the row through the injected unsubscribe and answers 200', async () => {
    const unsubscribe = vi.fn(async () => true);
    const response = await handleOneClick(post(`unsubscribe=${ID}`), unsubscribe);
    expect(response.status).toBe(200);
    expect(unsubscribe).toHaveBeenCalledWith(ID);
    expect(isOneClickRequest(new URL(`${BASE}/x?unsubscribe=${ID}`))).toBe(true);
    expect(isOneClickRequest(new URL(`${BASE}/x`))).toBe(false);
  });

  it('unknown id → 404; malformed id or wrong body → 400; GET (a link scanner) → 405 — none of these mark anything except the lookup', async () => {
    const miss = vi.fn(async () => false);
    expect((await handleOneClick(post(`unsubscribe=${crypto.randomUUID()}`), miss)).status).toBe(404);
    const never = vi.fn(async () => true);
    expect((await handleOneClick(post('unsubscribe=not-a-uuid'), never)).status).toBe(400);
    expect((await handleOneClick(post(`unsubscribe=${ID}`, 'List-Unsubscribe=Maybe'), never)).status).toBe(400);
    expect((await handleOneClick(post(`unsubscribe=${ID}`, '', 'GET'), never)).status).toBe(405);
    expect(never).not.toHaveBeenCalled();
  });

  it('a database failure propagates (the caller answers 500), never a false 200', async () => {
    await expect(handleOneClick(post(`unsubscribe=${ID}`), async () => { throw new Error('db down'); })).rejects.toThrow('db down');
  });
});

describe('pause', () => {
  it('site pause stops everything, welcome included; a paused pack skips tue/thu/weekend but still sends the welcome', () => {
    expect(pauseSkip(WELCOME_KIND, true, false)).toBe('paused-site');
    expect(pauseSkip('tue', true, true)).toBe('paused-site');
    for (const kind of ['tue', 'thu', 'weekend']) expect(pauseSkip(kind, false, true)).toBe('paused');
    expect(pauseSkip(WELCOME_KIND, false, true)).toBeNull();
    expect(pauseSkip('tue', false, false)).toBeNull();
  });

  it('the site switch is the CHECKIN_PAUSED secret, "1" only', () => {
    const env = (value: string) => (name: string) => (name === SITE_PAUSE_SECRET ? value : '');
    expect(sitePaused(env('1'))).toBe(true);
    expect(sitePaused(env(' 1 '))).toBe(true);
    for (const v of ['', '0', 'true', 'yes']) expect(sitePaused(env(v))).toBe(false);
  });

  it('the pack summary carries checkins_paused into the pack (a public pack is never paused)', () => {
    expect(SUMMARY_COLUMNS).toContain('checkins_paused');
    const summary = { pack_id: 'p1', leader_id: 'L', title: 'T', reflection_lines: ['a', 'b', 'c'] };
    expect(packFromSummary({ ...summary, checkins_paused: true }).paused).toBe(true);
    expect(packFromSummary(summary).paused).toBe(false);
  });
});

describe('index.ts wiring (source-level; Deno-only file)', () => {
  const source = readFileSync(path.resolve(__dirname, '../index.ts'), 'utf-8');
  const serve = source.slice(source.indexOf('Deno.serve('));
  const handle = source.slice(source.indexOf('async function handle('), source.indexOf('Deno.serve('));

  it('the one-click request is routed before the JSON handler and after the CORS preflight', () => {
    expect(serve.indexOf("request.method === 'OPTIONS'")).toBeLessThan(serve.indexOf('isOneClickRequest('));
    expect(serve.indexOf('handleOneClick(request, unsubscribeById)')).toBeLessThan(serve.indexOf('await handle(request)'));
    expect(source).toContain('rpc(UNSUBSCRIBE_FN, { p_id: signupId })');
  });

  it('the site pause is checked before the welcome dispatch; the pack pause after the pack is loaded and owned', () => {
    expect(handle.indexOf('sitePaused(env)')).toBeGreaterThan(-1);
    expect(handle.indexOf('sitePaused(env)')).toBeLessThan(handle.indexOf('handleWelcome('));
    expect(handle.indexOf('pauseSkip(kind, false, pack.paused === true)')).toBeGreaterThan(handle.indexOf('const pack = await loadPack('));
  });

  it('each member email gets its own one-click URL; the signup columns include unsubscribed_at', () => {
    expect(source).toContain("oneClickUrl: oneClickUrl(env('SUPABASE_URL'), id)");
    expect(source).toMatch(/const SIGNUP_COLUMNS = `[^`]*\$\{UNSUBSCRIBED_COLUMN\}`;/);
  });
});
