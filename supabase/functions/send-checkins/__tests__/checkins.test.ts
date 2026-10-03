/**
 * checkins.test.ts — the pure parts of send-checkins · 周中提醒单元测试
 *
 * Templates (Chinese first: greeting, practice, prompt, personal link; the
 * welcome; the Google Form path), kind-from-date in Los Angeles
 * time across DST, the 09:00 send-hour gate, recipient selection by consent
 * and channel, prompt extraction from the real sample pack, the schema-
 * version pin, and the two REST senders against a stubbed fetch.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  renderCheckin, kindFromDate, isSendHour, promptsFromPack, packUrl, greeting, practiceLine, checkinPageUrl, feedbackUrl,
  prefillFormUrl, KIND_LABEL, BILINGUAL_SEPARATOR, SITE_ORIGIN, CHECKIN_FROM_EMAIL, WELCOME_KIND, CheckinPack, MemberContext,
} from '../templates.ts';
import {
  selectRecipients, testRecipientRow, verifyLeader, memberContext, welcomeAllowed, WELCOME_WINDOW_MS, SignupRow,
} from '../recipients.ts';
import { checkinHash } from '../../../../components/checkin/checkinRoute';
import { sendEmail, sendSms, emailConfig, resendBody, RESEND_EMAILS_URL, twilioMessagesUrl, EmailConfig } from '../senders.ts';
import { loadCheckinPack, packFromSummary, PackSummaryRow } from '../packSource.ts';
import { PACK_SCHEMA_VERSION as APP_SCHEMA_VERSION } from '../../../../components/studypack/packTypes';
import { TEST_PACK_PATH } from '../../../../components/studypack/__tests__/fixtures';

const PACK: CheckinPack = {
  id: '2026-10-02-matt6',
  title: '不要忧虑 Do Not Be Anxious',
  leaderId: 'uid-lead',
  prompts: { tue: '周二跟进：操练做了吗？ · Tuesday check-in: did it happen?', thu: '周四 · Thu', weekend: '周末 · Weekend' },
  feedbackFormUrl: null,
  feedbackFormEntries: null,
};
const SIGNUP_ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';
const MEMBER: MemberContext = { name: '小明', signupId: SIGNUP_ID, practice: '睡前程序 · Wind-down' };
const FORM = 'https://docs.google.com/forms/d/e/abc/viewform';

describe('renderCheckin', () => {
  it('is greeting, the member\'s own practice, the prompt, then the personal check-in link — Chinese first on every line', () => {
    const m = renderCheckin('tue', PACK, MEMBER);
    const lines = m.text.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(greeting('小明'));
    expect(lines[0].indexOf('平安')).toBeLessThan(lines[0].indexOf('Peace'));
    expect(lines[1]).toBe(practiceLine(MEMBER.practice!));
    expect(lines[1]).toBe('你选的操练：睡前程序 · Wind-down · Your practice: 睡前程序 · Wind-down');
    expect(lines[2]).toBe(PACK.prompts.tue);
    expect(lines[3]).toBe(checkinPageUrl(SIGNUP_ID, 'tue'));
    expect(lines[3]).toBe(`${SITE_ORIGIN}/${checkinHash(SIGNUP_ID, 'tue')}`);   // same route the app parses
    expect(lines[3]).not.toContain('uid-lead');
  });

  it('the welcome restates the practice, promises the mid-week reminder, and links the check-in page without a kind', () => {
    const m = renderCheckin(WELCOME_KIND, PACK, MEMBER);
    expect(m.subject).toBe(`${KIND_LABEL.welcome.zh}${BILINGUAL_SEPARATOR}${KIND_LABEL.welcome.en} — ${PACK.title}`);
    const lines = m.text.split('\n');
    expect(lines[1]).toBe(practiceLine(MEMBER.practice!));
    expect(lines[2]).toBe('周中我们会再提醒你 · We will remind you mid-week');
    expect(lines[3]).toBe(checkinPageUrl(SIGNUP_ID, null));
  });

  it('without a practice (pre-commitment row) the line is omitted; the leader test (no signup id) links the pack', () => {
    const m = renderCheckin('weekend', PACK, { name: 'Ann', signupId: null, practice: null });
    expect(m.subject).toBe(`${KIND_LABEL.weekend.zh}${BILINGUAL_SEPARATOR}${KIND_LABEL.weekend.en} — ${PACK.title}`);
    const lines = m.text.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe(PACK.prompts.weekend);
    expect(lines[2]).toBe(packUrl(PACK.id));
  });

  it('a pack with a Google Form links the form (prefilled when entry ids exist) for every kind, welcome included', () => {
    const withForm = { ...PACK, feedbackFormUrl: FORM, feedbackFormEntries: { name: 'entry.1', practice: 'entry.2' } };
    const link = feedbackUrl(withForm, MEMBER, 'thu');
    expect(link).toBe(prefillFormUrl(FORM, withForm.feedbackFormEntries, { name: '小明', practice: MEMBER.practice! }));
    expect(new URL(link).searchParams.get('entry.2')).toBe('睡前程序 · Wind-down');
    expect(renderCheckin(WELCOME_KIND, withForm, MEMBER).text.split('\n')[3]).toBe(link);
    expect(feedbackUrl({ ...PACK, feedbackFormUrl: FORM }, MEMBER, 'tue')).toBe(FORM);   // no ids: plain form
    expect(feedbackUrl(PACK, MEMBER, 'tue')).toBe(checkinPageUrl(SIGNUP_ID, 'tue'));
  });
});

describe('memberContext + welcomeAllowed', () => {
  const row = (over: Partial<SignupRow>): SignupRow => ({
    id: SIGNUP_ID, pack_id: 'p', leader_id: 'uid-lead', name: 'n', phone: null, email: 'a@x.org', consent_checkins: true,
    practice_text: 'menu', practice_note: null, ...over,
  });

  it('the own version beats the menu text; neither → null', () => {
    expect(memberContext(row({}))).toEqual({ name: 'n', signupId: SIGNUP_ID, practice: 'menu' });
    expect(memberContext(row({ practice_note: ' mine ' })).practice).toBe('mine');
    expect(memberContext(row({ practice_text: null })).practice).toBeNull();
  });

  it('a welcome is allowed only for a row created within the last 10 minutes', () => {
    const now = new Date('2026-10-02T20:10:00Z');
    expect(welcomeAllowed(row({ created_at: '2026-10-02T20:05:00Z' }), now)).toEqual({ ok: true });
    expect(welcomeAllowed(row({ created_at: new Date(now.getTime() - WELCOME_WINDOW_MS - 1).toISOString() }), now).ok).toBe(false);
    expect(welcomeAllowed(row({ created_at: '2026-10-02T20:11:00Z' }), now).ok).toBe(false);   // from the future
    expect(welcomeAllowed(row({}), now).ok).toBe(false);                                        // no created_at
    expect(WELCOME_WINDOW_MS).toBe(10 * 60 * 1000);
  });
});

describe('kindFromDate (America/Los_Angeles)', () => {
  it('maps LA weekdays: Tue, Thu, Sat/Sun → weekend, others → null', () => {
    expect(kindFromDate(new Date('2026-10-06T16:30:00Z'))).toBe('tue');      // Tue 09:30 PDT
    expect(kindFromDate(new Date('2026-10-08T16:30:00Z'))).toBe('thu');
    expect(kindFromDate(new Date('2026-10-10T16:30:00Z'))).toBe('weekend');  // Sat
    expect(kindFromDate(new Date('2026-10-11T16:30:00Z'))).toBe('weekend');  // Sun
    expect(kindFromDate(new Date('2026-10-05T16:30:00Z'))).toBeNull();       // Mon
    expect(kindFromDate(new Date('2026-10-09T16:30:00Z'))).toBeNull();       // Fri
  });

  it('uses the LA date, not UTC: Tue 22:00 PDT is Wed in UTC', () => {
    expect(kindFromDate(new Date('2026-10-07T05:00:00Z'))).toBe('tue');
    expect(kindFromDate(new Date('2026-10-07T07:00:00Z'))).toBeNull();      // Wed 00:00 PDT
  });
});

describe('isSendHour', () => {
  it('is true only during the 09:00 LA hour, in both PDT and PST', () => {
    expect(isSendHour(new Date('2026-10-06T16:05:00Z'))).toBe(true);   // PDT 09:05
    expect(isSendHour(new Date('2026-10-06T17:05:00Z'))).toBe(false);  // PDT 10:05 (the PST cron line)
    expect(isSendHour(new Date('2026-01-06T17:05:00Z'))).toBe(true);   // PST 09:05
    expect(isSendHour(new Date('2026-01-06T16:05:00Z'))).toBe(false);  // PST 08:05 (the PDT cron line)
  });
});

describe('selectRecipients', () => {
  const row = (over: Partial<SignupRow>): SignupRow => ({
    id: 'x', pack_id: 'p', leader_id: 'uid-lead', name: 'n', phone: null, email: null, consent_checkins: true,
    practice_text: null, practice_note: null, ...over,
  });

  it('emails consenting rows with an email; skips no-consent and no-contact rows with a reason', () => {
    const rows = [
      row({ id: 'a', email: 'a@x.org' }),
      row({ id: 'b', email: 'b@x.org', consent_checkins: false }),
      row({ id: 'c' }),
    ];
    const s = selectRecipients(rows, { smsEnabled: false });
    expect(s.recipients).toEqual([{ signup: rows[0], channel: 'email', to: 'a@x.org' }]);
    expect(s.skipped.map(k => [k.signup.id, k.reason])).toEqual([['b', 'no-consent'], ['c', 'no-contact']]);
  });

  it('phone-only rows get SMS only when the switch is on; email wins when both exist', () => {
    const rows = [row({ id: 'p', phone: '+14085551234' }), row({ id: 'both', phone: '+1408', email: 'b@x.org' })];
    const off = selectRecipients(rows, { smsEnabled: false });
    expect(off.recipients.map(r => [r.signup.id, r.channel])).toEqual([['both', 'email']]);
    expect(off.skipped).toEqual([{ signup: rows[0], reason: 'sms-disabled' }]);
    const on = selectRecipients(rows, { smsEnabled: true });
    expect(on.recipients.map(r => [r.signup.id, r.channel, r.to])).toEqual([
      ['p', 'sms', '+14085551234'], ['both', 'email', 'b@x.org'],
    ]);
  });

  it('the leader test row is a consenting email-only recipient with no signup id, owned by the pack leader', () => {
    const s = selectRecipients([testRecipientRow('p', 'uid-lead', 'lead@x.org', 'Lead')], { smsEnabled: true });
    expect(s.recipients).toEqual([{ signup: testRecipientRow('p', 'uid-lead', 'lead@x.org', 'Lead'), channel: 'email', to: 'lead@x.org' }]);
    expect(s.recipients[0].signup.id).toBeNull();
    expect(s.recipients[0].signup.leader_id).toBe('uid-lead');
  });
});

describe('verifyLeader', () => {
  const row = (over: Partial<SignupRow>): SignupRow => ({
    id: 'x', pack_id: PACK.id, leader_id: 'uid-lead', name: 'n', phone: null, email: 'a@x.org', consent_checkins: true,
    practice_text: null, practice_note: null, ...over,
  });

  it('returns the pack leader when every row carries that leader and pack id', () => {
    expect(verifyLeader(PACK, [row({}), row({ id: 'y' })])).toBe('uid-lead');
    expect(verifyLeader(PACK, [])).toBe('uid-lead');
  });

  it('rejects a demo pack and any row from another leader or pack — never trusts the request', () => {
    expect(() => verifyLeader({ ...PACK, leaderId: null }, [row({})])).toThrow('no leader');
    expect(() => verifyLeader(PACK, [row({}), row({ leader_id: 'uid-other' })])).toThrow('1 sign-up row(s) belong to another leader or pack');
    expect(() => verifyLeader(PACK, [row({ pack_id: 'other-pack' })])).toThrow('another leader or pack');
  });
});

describe('promptsFromPack', () => {
  it('reads the three reflection lines of the shipped sample pack in tue/thu/weekend order', () => {
    const pack = promptsFromPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
    expect(pack.id).toBe('2026-10-02-matt6');
    expect(pack.leaderId).toBeNull();  // the committed sample pack is demo-only (ADR-0004)
    expect(promptsFromPack({ ...JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')), leaderId: 'uid-lead' }).leaderId).toBe('uid-lead');
    expect(pack.prompts.tue).toMatch(/^周二跟进/);
    expect(pack.prompts.thu).toMatch(/^周四跟进/);
    expect(pack.prompts.weekend).toMatch(/^周末回顾/);
    expect(pack.feedbackFormUrl).toBeNull();
    const raw = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));
    expect(promptsFromPack({ ...raw, feedbackFormUrl: FORM, feedbackFormEntries: { name: 'entry.1' } }))
      .toMatchObject({ feedbackFormUrl: FORM, feedbackFormEntries: { name: 'entry.1' } });
  });

  it('throws with context when the reflection section is missing or short', () => {
    expect(() => promptsFromPack({ id: 'x', title: 't', sections: [] })).toThrow('no reflection section');
    expect(() => promptsFromPack({ id: 'x', title: 't', sections: [{ kind: 'reflection', body: ['one'] }] })).toThrow('3 prompt lines');
    expect(() => promptsFromPack(null)).toThrow('id, title and sections');
  });
});

describe('loadCheckinPack (packSource)', () => {
  const summary: PackSummaryRow = {
    pack_id: 'local-2026-10-02-jhn3', leader_id: 'uid-lead', title: '祂必兴旺',
    reflection_lines: ['周二 · Tue', '周四 · Thu', '周末 · Weekend', '隐私 · privacy'],
  };
  const publicJson = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));

  it('prefers the owner\'s pack_summaries row and never touches the public JSON', async () => {
    const fetchPublic = vi.fn(async () => publicJson);
    const pack = await loadCheckinPack(summary.pack_id, { readSummary: async () => summary, fetchPublic });
    expect(pack).toEqual(packFromSummary(summary));
    expect(pack.leaderId).toBe('uid-lead');
    expect(pack.prompts).toEqual({ tue: '周二 · Tue', thu: '周四 · Thu', weekend: '周末 · Weekend' });
    expect(pack.feedbackFormUrl).toBeNull();
    expect(fetchPublic).not.toHaveBeenCalled();
    const withForm = await loadCheckinPack(summary.pack_id, {
      readSummary: async () => ({ ...summary, feedback_form_url: FORM, feedback_form_entries: { practice: 'entry.2' } }), fetchPublic,
    });
    expect(withForm).toMatchObject({ feedbackFormUrl: FORM, feedbackFormEntries: { practice: 'entry.2' } });
  });

  it('falls back to the public pack JSON only when there is no summary; errors when neither exists', async () => {
    const pack = await loadCheckinPack('2026-10-02-matt6', { readSummary: async () => null, fetchPublic: async () => publicJson });
    expect(pack.id).toBe('2026-10-02-matt6');
    expect(pack.leaderId).toBeNull();
    await expect(loadCheckinPack('local-x', { readSummary: async () => null, fetchPublic: async () => null }))
      .rejects.toThrow('no pack_summaries row');
    expect(() => packFromSummary({ ...summary, reflection_lines: ['one'] })).toThrow('3 reflection lines');
  });
});

describe('PACK_SCHEMA_VERSION pin', () => {
  it('the function fetches the same pack schema version the app serves', () => {
    const source = readFileSync(path.resolve(__dirname, '../index.ts'), 'utf-8');
    const match = /export const PACK_SCHEMA_VERSION = (\d+);/.exec(source);
    expect(Number(match?.[1])).toBe(APP_SCHEMA_VERSION);
  });
});

describe('senders', () => {
  afterEach(() => vi.unstubAllGlobals());
  const message = { subject: 'S', text: 'T' };

  const email: EmailConfig = { apiKey: 're_key', from: CHECKIN_FROM_EMAIL, replyTo: null };
  const REPLY_TO = 'Study Agent <agent@agentmail.to>';

  it('emailConfig: the CHECKIN_FROM / CHECKIN_REPLY_TO secrets win; blank or unset fall back to the constant / no reply-to', () => {
    const lookup = (vars: Record<string, string>) => (name: string) => vars[name] ?? '';
    expect(emailConfig(lookup({ RESEND_API_KEY: 'k' }))).toEqual({ apiKey: 'k', from: CHECKIN_FROM_EMAIL, replyTo: null });
    expect(emailConfig(lookup({ RESEND_API_KEY: 'k', CHECKIN_FROM: '  ', CHECKIN_REPLY_TO: '' })))
      .toEqual({ apiKey: 'k', from: CHECKIN_FROM_EMAIL, replyTo: null });
    expect(emailConfig(lookup({ RESEND_API_KEY: 'k', CHECKIN_FROM: 'Me <me@x.org> ', CHECKIN_REPLY_TO: ` ${REPLY_TO}` })))
      .toEqual({ apiKey: 'k', from: 'Me <me@x.org>', replyTo: REPLY_TO });
  });

  it('resendBody carries reply_to only when configured (Resend\'s field name is reply_to)', () => {
    expect(resendBody(email, 'a@x.org', message)).toEqual({ from: CHECKIN_FROM_EMAIL, to: ['a@x.org'], subject: 'S', text: 'T' });
    expect(resendBody({ ...email, from: 'Me <me@x.org>', replyTo: REPLY_TO }, 'a@x.org', message))
      .toEqual({ from: 'Me <me@x.org>', to: ['a@x.org'], subject: 'S', text: 'T', reply_to: REPLY_TO });
  });

  it('sendEmail posts the configured from (env over constant) and reply_to to Resend; resolves on 200', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    await sendEmail(email, 'a@x.org', message);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_EMAILS_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toEqual({ from: CHECKIN_FROM_EMAIL, to: ['a@x.org'], subject: 'S', text: 'T' });
    expect(JSON.parse(init.body as string)).not.toHaveProperty('reply_to');
    await sendEmail(emailConfig(name => ({ RESEND_API_KEY: 're_key', CHECKIN_FROM: 'Me <me@x.org>', CHECKIN_REPLY_TO: REPLY_TO })[name] ?? ''), 'b@x.org', message);
    const [, second] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(second.body as string)).toEqual({ from: 'Me <me@x.org>', to: ['b@x.org'], subject: 'S', text: 'T', reply_to: REPLY_TO });
  });

  it('sendEmail throws with the provider text on a non-OK status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422, text: async () => 'domain not verified' })));
    await expect(sendEmail(email, 'a@x.org', message)).rejects.toThrow('Resend HTTP 422: domain not verified');
  });

  it('sendSms posts form-encoded to the account Messages URL with basic auth; throws on failure', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 201, text: async () => '' }));
    vi.stubGlobal('fetch', fetchMock);
    await sendSms({ accountSid: 'AC1', authToken: 'tok', from: '+1555' }, '+1408', message);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(twilioMessagesUrl('AC1'));
    expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa('AC1:tok')}`);
    expect(new URLSearchParams(init.body as string).get('Body')).toBe('T');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, text: async () => 'bad token' })));
    await expect(sendSms({ accountSid: 'AC1', authToken: 'x', from: '+1' }, '+1408', message)).rejects.toThrow('Twilio HTTP 401');
  });
});
