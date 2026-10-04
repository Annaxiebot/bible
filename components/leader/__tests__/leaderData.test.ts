/**
 * leaderData.test.ts — rows + answers queries, commitment/feedback counts, CSV, dry-run test call · 组长数据层测试
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSignups, fetchAnswers, signupsToCsv, csvFilename, sendTestCheckin, commitmentCounts, feedbackCounts, latestAnswers,
  SignupRecord, AnswerRecord, SIGNUP_COLUMNS, ANSWER_COLUMNS, CSV_COLUMNS, SEND_CHECKINS_FUNCTION, TEST_CHECKIN_KIND,
} from '../leaderData';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../../signup/signupSchema';
import { LD_ERR_LOAD, LD_TEST_FAILED } from '../leaderStrings';
import type { StudyPack } from '../../studypack/packTypes';

const LEADER_ID = 'uid-lead';
const ROWS: SignupRecord[] = [
  {
    id: '1', leader_id: LEADER_ID, name: '小明', phone: '+14085551234', email: 'ming@example.org', consent_checkins: true,
    created_at: '2026-10-02T20:00:00Z', practice_area: '健康 Health', practice_text: '睡前程序 · Wind-down', practice2_area: null,
    practice2_text: null, practice_note: null,
  },
  {
    id: '2', leader_id: LEADER_ID, name: 'Ann "Annie" Lee', phone: null, email: 'ann@example.org', consent_checkins: false,
    created_at: '2026-10-02T21:00:00Z', practice_area: '健康 Health', practice_text: '睡前程序 · Wind-down', practice2_area: '工作 Work',
    practice2_text: '写下忧虑 · Write it down', practice_note: '十点关机 · Phone off at ten',
  },
];
const ANSWERS: AnswerRecord[] = [
  { id: 'a2', signup_id: '1', leader_id: LEADER_ID, kind: 'tue', answer: 'later', created_at: '2026-10-07T00:00:00Z' },
  { id: 'a1', signup_id: '1', leader_id: LEADER_ID, kind: 'tue', answer: 'earlier', created_at: '2026-10-06T00:00:00Z' },
  { id: 'a3', signup_id: '2', leader_id: LEADER_ID, kind: 'thu', answer: 'did it, "mostly"', created_at: '2026-10-08T00:00:00Z' },
];

function queryClient(result: { data: unknown; error: { message: string } | null }) {
  const order = vi.fn(async () => result);
  const chain = { eq: vi.fn(), order };
  chain.eq.mockReturnValue(chain);
  const select = vi.fn(() => chain);
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq: chain.eq, order };
}

describe('fetchSignups / fetchAnswers', () => {
  it('selects the list columns for the pack AND the leader uid, newest first', async () => {
    const { client, from, select, eq, order } = queryClient({ data: ROWS, error: null });
    expect(await fetchSignups(client, 'p', LEADER_ID)).toEqual(ROWS);
    expect(from).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(select).toHaveBeenCalledWith(SIGNUP_COLUMNS);
    expect(SIGNUP_COLUMNS).toContain('practice_text');
    expect(eq.mock.calls).toEqual([['pack_id', 'p'], ['leader_id', LEADER_ID]]);
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('answers come from checkin_answers with the same ownership guard', async () => {
    const foreign = { ...ANSWERS[0], id: 'x', leader_id: 'uid-other' };
    const { client, from, select, eq } = queryClient({ data: [...ANSWERS, foreign], error: null });
    expect(await fetchAnswers(client, 'p', LEADER_ID)).toEqual(ANSWERS);
    expect(from).toHaveBeenCalledWith(CHECKIN_ANSWERS_TABLE);
    expect(select).toHaveBeenCalledWith(ANSWER_COLUMNS);
    expect(eq.mock.calls).toEqual([['pack_id', 'p'], ['leader_id', LEADER_ID]]);
  });

  it('drops any row whose leader_id is not the signed-in uid, even if the server returned it', async () => {
    const foreign = { ...ROWS[1], id: '3', leader_id: 'uid-other' };
    const { client } = queryClient({ data: [...ROWS, foreign], error: null });
    expect(await fetchSignups(client, 'p', LEADER_ID)).toEqual(ROWS);
  });

  it('throws the bilingual load error with the PostgREST message', async () => {
    const { client } = queryClient({ data: null, error: { message: 'JWT expired' } });
    await expect(fetchSignups(client, 'p', LEADER_ID)).rejects.toThrow(`${LD_ERR_LOAD}: JWT expired`);
    await expect(fetchAnswers(client, 'p', LEADER_ID)).rejects.toThrow(`${LD_ERR_LOAD}: JWT expired`);
  });
});

describe('commitments + feedback', () => {
  it('old rows (no practices): counts first + second choice per area', () => {
    expect(commitmentCounts(ROWS)).toEqual([{ area: '健康 Health', count: 2 }, { area: '工作 Work', count: 1 }]);
    expect(commitmentCounts([{ ...ROWS[0], practice_area: null }])).toEqual([]);
  });

  it('new rows: every chosen practice counts once per member, in first-seen order', () => {
    const many = { ...ROWS[0], id: '3', practices: [
      { area: '家庭 Family', practice: '一起吃饭' }, { area: '健康 Health', practice: '散步' }, { area: '金钱 Money', practice: '记账' },
    ] };
    expect(commitmentCounts([many, ROWS[1]])).toEqual([
      { area: '家庭 Family', count: 1 }, { area: '健康 Health', count: 2 }, { area: '金钱 Money', count: 1 }, { area: '工作 Work', count: 1 },
    ]);
    expect(SIGNUP_COLUMNS).toContain('practices');
  });

  it('feedbackCounts: members answered (any kind, and per kind) vs signed up; latestAnswers keeps the newest per kind', () => {
    expect(feedbackCounts(ROWS, ANSWERS)).toEqual({ signedUp: 2, answered: 2, byKind: { tue: 1, thu: 1, weekend: 0 } });
    expect(feedbackCounts(ROWS, [])).toEqual({ signedUp: 2, answered: 0, byKind: { tue: 0, thu: 0, weekend: 0 } });
    expect(latestAnswers(ANSWERS).get('1')).toEqual({ tue: 'later' });
    expect(latestAnswers(ANSWERS).get('2')).toEqual({ thu: 'did it, "mostly"' });
  });
});

describe('signupsToCsv', () => {
  it('writes a BOM, the header, one line per row with practice + shared answers, quoting as needed', () => {
    const csv = signupsToCsv(ROWS, ANSWERS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(CSV_COLUMNS).toEqual(expect.arrayContaining(['practice_area', 'practice_text', 'practice_note', 'practices', 'answer_tue', 'answer_thu', 'answer_weekend']));
    expect(lines[1]).toBe('小明,+14085551234,ming@example.org,true,2026-10-02T20:00:00Z,健康 Health,睡前程序 · Wind-down,,,,健康 Health: 睡前程序 · Wind-down,later,,');
    expect(lines[2]).toBe(
      '"Ann ""Annie"" Lee",,ann@example.org,false,2026-10-02T21:00:00Z,健康 Health,睡前程序 · Wind-down,工作 Work,写下忧虑 · Write it down,十点关机 · Phone off at ten,'
      + '健康 Health: 睡前程序 · Wind-down; 工作 Work: 写下忧虑 · Write it down,,"did it, ""mostly""",'
    );
    expect(lines[3]).toBe('');
    const many = { ...ROWS[0], practices: [{ area: 'A', practice: 'a' }, { area: 'B', practice: 'b' }, { area: 'C', practice: 'c' }] };
    expect(signupsToCsv([many]).split('\n')[1]).toContain(',A: a; B: b; C: c,');
    expect(signupsToCsv(ROWS).split('\n')[1].endsWith(',,,')).toBe(true);
    expect(csvFilename('2026-10-02-matt6')).toBe('signups-2026-10-02-matt6.csv');
  });
});

describe('sendTestCheckin', () => {
  const pack = { id: 'p', title: 't', sections: [] } as unknown as StudyPack;
  function fnClient(result: { data: unknown; error: { message: string } | null }) {
    const invoke = vi.fn(async () => result);
    return { client: { functions: { invoke } } as unknown as SupabaseClient, invoke };
  }

  it('invokes send-checkins with only the pack id (text comes from pack_summaries), the leader email as test_to', async () => {
    const data = { dry_run: true, attempted: 1, results: [{ status: 'dry-run', to: 'lead@x.org' }] };
    const { client, invoke } = fnClient({ data, error: null });
    expect(await sendTestCheckin(client, pack, 'lead@x.org', 'Lead')).toEqual(data);
    expect(invoke).toHaveBeenCalledWith(SEND_CHECKINS_FUNCTION, {
      body: { pack_id: 'p', kind: TEST_CHECKIN_KIND, test_to: 'lead@x.org', test_name: 'Lead' },
    });
  });

  it('throws on an invoke error, on an unexpected attempt count, and on a failed delivery', async () => {
    await expect(sendTestCheckin(fnClient({ data: null, error: { message: '403' } }).client, pack, 'e', 'n'))
      .rejects.toThrow(`${LD_TEST_FAILED}: 403`);
    await expect(sendTestCheckin(fnClient({ data: { dry_run: true, attempted: 0 }, error: null }).client, pack, 'e', 'n'))
      .rejects.toThrow(LD_TEST_FAILED);
    const failed = { dry_run: false, attempted: 1, results: [{ status: 'failed', to: 'e', error: 'Resend HTTP 422' }] };
    await expect(sendTestCheckin(fnClient({ data: failed, error: null }).client, pack, 'e', 'n'))
      .rejects.toThrow(`${LD_TEST_FAILED}: Resend HTTP 422`);
  });
});
