/**
 * feedbackHandler.test.ts — the feedback function's decisions, with fakes · 反馈函数测试 (ADR-0011)
 *
 * The fakes keep the real constraints: the store refuses what the table's
 * CHECKs refuse, counts by ip_hash within the window like the live query,
 * and the sender is the real resendBody path (fetch stubbed) so Reply-To
 * and From are what Resend would get.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleFeedback, FeedbackDeps, FeedbackInsert } from '../feedbackHandler.ts';
import { hashClientIp } from '../../_shared/clientIp.ts';
import { feedbackEmail, DETAIL_LABEL, FEEDBACK_SOURCE_LABEL, NO_REPLY_EMAIL, UNKNOWN_SOURCE, OPEN_STUDY_LABEL, formatReceived, feedbackEmailConfig, FEEDBACK_SUBJECT } from '../feedbackEmail.ts';
import { emailConfig, sendEmail, RESEND_EMAILS_URL } from '../../send-checkins/senders.ts';
import { FEEDBACK_MAX_CHARS, FEEDBACK_EMAIL_MAX_CHARS, RATE_LIMIT_COUNT, HONEYPOT_FIELD } from '../../_shared/feedback.ts';

const NOW = new Date('2026-10-06T12:00:00Z');

function fakeStore() {
  const rows: Array<FeedbackInsert & { id: string; created_at: string }> = [];
  return {
    rows,
    countSince: async (ipHash: string, sinceIso: string) => rows.filter(r => r.ip_hash === ipHash && r.created_at >= sinceIso).length,
    insert: async (row: FeedbackInsert) => {
      if (row.message.length < 1 || row.message.length > FEEDBACK_MAX_CHARS) throw new Error('feedback_message_length');
      if (row.email !== null && row.email.length > FEEDBACK_EMAIL_MAX_CHARS) throw new Error('feedback_email_length');
      const stored = { ...row, id: `row-${rows.length + 1}`, created_at: NOW.toISOString() };
      rows.push(stored);
      return { id: stored.id, created_at: stored.created_at };
    },
  };
}

function deps(over: Partial<FeedbackDeps> = {}) {
  const store = fakeStore();
  const sent: Array<{ subject: string; replyTo: string | null }> = [];
  const errors: string[] = [];
  const d: FeedbackDeps = {
    salt: 'test-salt', now: () => NOW, countSince: store.countSince, insert: store.insert,
    send: async (message, replyTo) => { sent.push({ subject: message.subject, replyTo }); },
    logError: m => errors.push(m), ...over,
  };
  return { d, store, sent, errors };
}

describe('handleFeedback', () => {
  it('POST only', async () => {
    const { d, store } = deps();
    expect((await handleFeedback('GET', null, '1.2.3.4', d)).status).toBe(405);
    expect(store.rows).toHaveLength(0);
  });

  it('honeypot / empty / too long / bad email → 400 and nothing stored or sent', async () => {
    const { d, store, sent } = deps();
    const bad = [
      { message: 'hi', [HONEYPOT_FIELD]: 'x' }, { message: '' }, { message: 'x'.repeat(FEEDBACK_MAX_CHARS + 1) },
      { message: 'hi', email: 'nope' },
    ];
    for (const body of bad) expect((await handleFeedback('POST', body, '1.2.3.4', d)).status).toBe(400);
    expect(store.rows).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('stores the trimmed message with a salted ip hash (never the IP), emails once with Reply-To = the writer', async () => {
    const { d, store, sent } = deps();
    const reply = await handleFeedback('POST', { message: ' 谢谢 ', email: 'm@x.org', context: { from: 'email', pack: 'p1' } }, '1.2.3.4', d);
    expect(reply).toEqual({ status: 200, body: { id: 'row-1', emailed: true } });
    expect(store.rows[0]).toMatchObject({ message: '谢谢', email: 'm@x.org', context: { from: 'email', pack: 'p1' } });
    expect(store.rows[0].ip_hash).toBe(await hashClientIp('test-salt', '1.2.3.4'));
    expect(JSON.stringify(store.rows[0])).not.toContain('1.2.3.4');
    expect(sent).toEqual([{ subject: FEEDBACK_SUBJECT, replyTo: 'm@x.org' }]);
  });

  it(`the ${RATE_LIMIT_COUNT + 1}th message from one IP within the hour → 429, another IP is unaffected`, async () => {
    const { d, store } = deps();
    for (let i = 0; i < RATE_LIMIT_COUNT; i++) expect((await handleFeedback('POST', { message: `m${i}` }, '1.2.3.4', d)).status).toBe(200);
    expect(await handleFeedback('POST', { message: 'again' }, '1.2.3.4', d)).toEqual({ status: 429, body: { error: 'rate-limited' } });
    expect((await handleFeedback('POST', { message: 'other' }, '5.6.7.8', d)).status).toBe(200);
    expect(store.rows).toHaveLength(RATE_LIMIT_COUNT + 1);
  });

  it('a send failure keeps the row and still answers 200 with the id (emailed:false), logged', async () => {
    const { d, store, errors } = deps({ send: async () => { throw new Error('Resend HTTP 500'); } });
    expect(await handleFeedback('POST', { message: 'hi' }, '1.2.3.4', d)).toEqual({ status: 200, body: { id: 'row-1', emailed: false } });
    expect(store.rows).toHaveLength(1);
    expect(errors[0]).toContain('Resend HTTP 500');
  });

  it('refuses to run without a salt (500) — validation still comes first', async () => {
    const { d, store } = deps({ salt: '' });
    expect((await handleFeedback('POST', { message: '' }, '1.2.3.4', d)).status).toBe(400);
    expect((await handleFeedback('POST', { message: 'hi' }, '1.2.3.4', d)).status).toBe(500);
    expect(store.rows).toHaveLength(0);
  });
});

describe('feedbackEmail', () => {
  const row = { id: 'row-1', createdAt: '2026-10-06T12:00:00Z', message: '<b>hi</b> & "you"', email: 'm@x.org', context: { from: 'email' as const, pack: 'p1' } };

  it('text: subject line, the message as typed, then plain-language details in Pacific time; no row id', () => {
    const m = feedbackEmail(row);
    expect(m.subject).toBe('意见反馈 · Feedback — scripturetolife.org');
    expect(m.text.split('\n')).toEqual([
      FEEDBACK_SUBJECT, '', row.message, '',
      `${DETAIL_LABEL.reply}: m@x.org`,
      `${DETAIL_LABEL.from}: ${FEEDBACK_SOURCE_LABEL.email}`,
      `${DETAIL_LABEL.study}: https://scripturetolife.org/#/pack/p1`,
      `${DETAIL_LABEL.received}: 2026-10-06 05:00 (Pacific)`,
    ]);
    expect(m.text).not.toContain('row-1');
    expect(m.html).not.toContain('row-1');
  });

  it('no email, no pack, no source: says so plainly and leaves out the study line (regression: "Pack: —")', () => {
    const m = feedbackEmail({ ...row, email: null, context: {} });
    expect(m.text).toContain(`${DETAIL_LABEL.reply}: ${NO_REPLY_EMAIL}`);
    expect(m.text).toContain(`${DETAIL_LABEL.from}: ${UNKNOWN_SOURCE}`);
    expect(m.text).not.toContain(DETAIL_LABEL.study);
    expect(m.text).not.toContain('—\n');
    expect(m.html).not.toContain('Pack:');
  });

  it('HTML: paper-style page with a mailto reply link and an "open the study" link, no raw URL shown', () => {
    const html = feedbackEmail(row).html!;
    expect(html).toContain('href="mailto:m@x.org"');
    expect(html).toContain(`href="https://scripturetolife.org/#/pack/p1"`);
    expect(html).toContain(OPEN_STUDY_LABEL);
    expect(html).not.toContain('>https://');
    expect(formatReceived('2026-01-15T20:30:00Z')).toBe('2026-01-15 12:30 (Pacific)');
  });

  it('HTML escapes every user value; no script or raw tags from the message', () => {
    const html = feedbackEmail({ ...row, email: '"><script>@x.org' }).html!;
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;');
    expect(html).not.toContain('<b>hi</b>');
    expect(html).not.toContain('<script>');
  });

  it('goes out through the check-in Resend sender: From = CHECKIN_FROM, Reply-To = the writer, to FEEDBACK_TO', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = (n: string) => ({ RESEND_API_KEY: 'k', CHECKIN_FROM: 'STL <checkins@scripturetolife.org>', CHECKIN_REPLY_TO: 'old@x.org' } as Record<string, string>)[n] ?? '';
    await sendEmail(feedbackEmailConfig(emailConfig(env), 'm@x.org'), 'owner@example.com', feedbackEmail(row));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_EMAILS_URL);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ from: 'STL <checkins@scripturetolife.org>', to: ['owner@example.com'], reply_to: 'm@x.org', subject: FEEDBACK_SUBJECT });
    expect(body.headers).toBeUndefined();   // no List-Unsubscribe on a notification
    await sendEmail(feedbackEmailConfig(emailConfig(env), null), 'owner@example.com', feedbackEmail({ ...row, email: null }));
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).reply_to).toBeUndefined();
  });
});

afterEach(() => { vi.unstubAllGlobals(); });
