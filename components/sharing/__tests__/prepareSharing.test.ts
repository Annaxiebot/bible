/**
 * prepareSharing.test.ts — the pipeline over a mocked ai-proxy · 生成上周分享测试 (ADR-0008)
 *
 * Hosted path through the dev e2e seams (no own key): every AI request is
 * captured, so the tests assert what is — and is not — sent.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { prepareSharing, SHARING_ATTEMPTS } from '../prepareSharing';
import { SharingError } from '../sharingReply';
import { SH_ERR_INVALID, SH_ERR_LOAD, SH_ERR_NOTHING, SHARING_HEADING, practiceCountLine } from '../sharingStrings';
import { quotaLine } from '../../studypack/tvHints';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../../signup/signupSchema';
import {
  LEADER, PREVIOUS, CURRENT, SIGNUPS, IDENTIFIERS, GOOD_REPLY, defaultClient, fakeClient, sseResponse,
} from './fixtures';

type Seams = Window & { __LEADER_E2E__?: unknown; __SUPABASE_E2E__?: unknown };

function run(client = defaultClient().client) {
  return prepareSharing({ client, uid: LEADER, current: CURRENT, previous: PREVIOUS, signal: new AbortController().signal });
}

function stubFetch(...replies: Response[]) {
  const fetchMock = vi.fn(async () => replies.shift() ?? sseResponse(GOOD_REPLY));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sentBodies = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.map(call => (call as unknown as [string, RequestInit])[1].body as string);

beforeEach(() => {
  (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
  (window as Seams).__LEADER_E2E__ = { uid: LEADER, email: null, name: null };
  (window as Seams).__SUPABASE_E2E__ = { url: 'http://localhost:3000/e2e-supabase', anonKey: 'e2e-anon' };
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as Seams).__LEADER_E2E__;
  delete (window as Seams).__SUPABASE_E2E__;
});

describe('prepareSharing', () => {
  it('drafts with role "sharing", sends no identifiers, and builds themes → 「quotes」 → counts → question', async () => {
    const fetchMock = stubFetch(sseResponse(GOOD_REPLY));
    const result = await run();
    expect(result.aiUsed).toBe(true);
    expect(result.section).toEqual({
      kind: 'sharing', heading: SHARING_HEADING,
      body: [
        '散步让焦虑（anxiety）变少', '家人一起操练更容易坚持', '「晚饭后走一走，心里松了」', '「和孩子一起祷告」',
        practiceCountLine([{ area: '健康 Health', count: 2 }, { area: '家庭 Family', count: 1 }]),
        '上周的操练里，哪一刻你经历了不再忧虑？',
      ],
    });
    const [body] = sentBodies(fetchMock);
    expect(JSON.parse(body).role).toBe('sharing');
    for (const id of IDENTIFIERS) expect(body).not.toContain(id);
    for (const s of SIGNUPS) expect(body).not.toContain(s.practice_note as string);  // own versions are not sent either
  });

  it('zero shared answers: no AI call, the section is the practice-count line alone', async () => {
    const fetchMock = stubFetch();
    const { client } = fakeClient({ [SIGNUPS_TABLE]: { data: SIGNUPS, error: null } });
    const result = await run(client);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      aiUsed: false,
      section: { kind: 'sharing', heading: SHARING_HEADING, body: [practiceCountLine([{ area: '健康 Health', count: 2 }, { area: '家庭 Family', count: 1 }])] },
    });
  });

  it('no sign-ups and no answers → SharingError nothing, no AI call', async () => {
    const fetchMock = stubFetch();
    await expect(run(fakeClient().client)).rejects.toMatchObject({ kind: 'nothing', message: SH_ERR_NOTHING });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('an invalid reply is retried once; the second valid reply is used', async () => {
    const fetchMock = stubFetch(sseResponse('not json at all'), sseResponse(GOOD_REPLY));
    expect((await run()).aiUsed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(SHARING_ATTEMPTS);
  });

  it('two invalid replies → SharingError invalid-reply after exactly two calls', async () => {
    const fetchMock = stubFetch(sseResponse('{"themes": []}'), sseResponse('{"themes": []}'));
    await expect(run()).rejects.toMatchObject({ kind: 'invalid-reply', message: SH_ERR_INVALID });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a hosted quota reply is SharingError ai carrying the askAIErrors quota line', async () => {
    stubFetch({ ok: false, status: 429, json: async () => ({ error: 'quota', role: 'sharing', limit: 10 }) } as unknown as Response);
    const err = await run().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SharingError);
    expect(err).toMatchObject({ kind: 'ai', message: quotaLine(10) });
  });

  it('a failed read is SharingError load with the PostgREST message', async () => {
    const { client } = fakeClient({ [CHECKIN_ANSWERS_TABLE]: { data: null, error: { message: 'boom' } } });
    const err = await run(client).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'load' });
    expect((err as Error).message).toContain(SH_ERR_LOAD);
    expect((err as Error).message).toContain('boom');
  });
});
