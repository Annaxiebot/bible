/**
 * googleForms.test.ts — create a feedback form through the Forms API · 自动建表单测试
 *
 * fetch is stubbed: the create and batchUpdate request bodies are pinned,
 * the responder link is extracted, 401/403 become typed failures (API not
 * enabled told apart from a missing scope), and the sign-in scope/query
 * constants carry the Forms scope + offline/consent.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createFeedbackForm, formTitle, formItems, batchUpdateBody, failureFor, FORMS_API_BASE, GOOGLE_FORMS_SCOPE,
  GOOGLE_SIGN_IN_SCOPES, GOOGLE_SIGN_IN_QUERY, OTHER_OPTION,
} from '../googleForms';
import { LIFE_AREAS } from '../../components/studypack/principles';

const practices = LIFE_AREAS.map(a => `${a} practice`);
const source = { title: '不要忧虑 Do Not Be Anxious', practices };

type Reply = { status: number; json: unknown };
function stubFetch(replies: Reply[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let i = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[Math.min(i++, replies.length - 1)];
    return { status: reply.status, json: async () => reply.json };
  }));
  return calls;
}

describe('googleForms', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sign-in asks for the Forms scope with offline access + consent', () => {
    expect(GOOGLE_SIGN_IN_SCOPES.split(' ')).toContain(GOOGLE_FORMS_SCOPE);
    expect(GOOGLE_SIGN_IN_SCOPES).toContain('openid email profile');
    expect(GOOGLE_SIGN_IN_QUERY).toEqual({ access_type: 'offline', prompt: 'consent' });
  });

  it('creates the form (title) then adds the five items with the bearer token; returns the responder link', async () => {
    const calls = stubFetch([
      { status: 200, json: { formId: 'f1', responderUri: 'https://docs.google.com/forms/d/e/f1/viewform' } },
      { status: 200, json: { replies: [] } },
    ]);
    const result = await createFeedbackForm(source, 'tok');
    expect(result).toEqual({ ok: true, formId: 'f1', responderUri: 'https://docs.google.com/forms/d/e/f1/viewform' });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe(FORMS_API_BASE);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ info: { title: formTitle(source.title), documentTitle: formTitle(source.title) } });
    expect(calls[1].url).toBe(`${FORMS_API_BASE}/f1:batchUpdate`);
    expect(JSON.parse(calls[1].init.body as string)).toEqual(batchUpdateBody(practices));
  });

  it('the items are name, practice (seven options + Other), what I did, what changed, OK to share', () => {
    const items = formItems(practices) as Array<{ title: string; questionItem: { question: { required: boolean; choiceQuestion?: { options: Array<{ value: string }> } } } }>;
    expect(items.map(i => i.title)).toEqual([
      '姓名 Name', '我本周的操练 My practice', '我做了什么 What I did', '我里面有什么改变 What changed in me', '可以在小组分享吗 OK to share with the group?',
    ]);
    expect(items[1].questionItem.question.choiceQuestion!.options.map(o => o.value)).toEqual([...practices, OTHER_OPTION]);
    expect(items[0].questionItem.question.required).toBe(true);
    expect(batchUpdateBody(practices).requests.map(r => (r as { createItem: { location: { index: number } } }).createItem.location.index)).toEqual([0, 1, 2, 3, 4]);
    expect(formTitle('T')).toBe('T · 本周操练反馈 Weekly practice feedback');
  });

  it('typed failures: no token; 401/403 → no-permission; 403 accessNotConfigured → api-disabled; other → api with message', async () => {
    expect(await createFeedbackForm(source, null)).toEqual({ ok: false, failure: { kind: 'no-token' } });
    stubFetch([{ status: 401, json: { error: { message: 'Invalid Credentials' } } }]);
    expect(await createFeedbackForm(source, 'old')).toEqual({ ok: false, failure: { kind: 'no-permission' } });
    expect(failureFor(403, { error: { message: 'insufficient scope' } })).toEqual({ kind: 'no-permission' });
    expect(failureFor(403, { error: { message: 'Google Forms API has not been used in project 1 before or it is disabled', errors: [{ reason: 'accessNotConfigured' }] } }))
      .toEqual({ kind: 'api-disabled' });
    expect(failureFor(500, { error: { message: 'boom' } })).toEqual({ kind: 'api', message: 'boom' });
    expect(failureFor(502, null)).toEqual({ kind: 'api', message: 'HTTP 502' });
  });

  it('a batchUpdate failure after a successful create is reported (the half-built form is not linked)', async () => {
    stubFetch([
      { status: 200, json: { formId: 'f1', responderUri: 'https://docs.google.com/forms/d/e/f1/viewform' } },
      { status: 403, json: { error: { message: 'no scope' } } },
    ]);
    expect(await createFeedbackForm(source, 'tok')).toEqual({ ok: false, failure: { kind: 'no-permission' } });
    stubFetch([{ status: 200, json: { formId: 'f1' } }]);
    expect(await createFeedbackForm(source, 'tok')).toMatchObject({ ok: false, failure: { kind: 'api' } });
  });
});
