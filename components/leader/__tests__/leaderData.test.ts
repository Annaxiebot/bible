/**
 * leaderData.test.ts — rows query, CSV content, dry-run test call · 组长数据层测试
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchSignups, signupsToCsv, csvFilename, sendTestCheckin, SignupRecord, SIGNUP_COLUMNS, CSV_COLUMNS,
  SEND_CHECKINS_FUNCTION, TEST_CHECKIN_KIND,
} from '../leaderData';
import { SIGNUPS_TABLE } from '../../signup/signupSchema';
import { LD_ERR_LOAD, LD_TEST_FAILED } from '../leaderStrings';
import type { StudyPack } from '../../studypack/packTypes';

const LEADER_ID = 'uid-lead';
const ROWS: SignupRecord[] = [
  { id: '1', leader_id: LEADER_ID, name: '小明', phone: '+14085551234', email: 'ming@example.org', consent_checkins: true, created_at: '2026-10-02T20:00:00Z' },
  { id: '2', leader_id: LEADER_ID, name: 'Ann "Annie" Lee', phone: null, email: 'ann@example.org', consent_checkins: false, created_at: '2026-10-02T21:00:00Z' },
];

function queryClient(result: { data: unknown; error: { message: string } | null }) {
  const order = vi.fn(async () => result);
  const chain = { eq: vi.fn(), order };
  chain.eq.mockReturnValue(chain);
  const select = vi.fn(() => chain);
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, from, select, eq: chain.eq, order };
}

describe('fetchSignups', () => {
  it('selects the list columns for the pack AND the leader uid, newest first', async () => {
    const { client, from, select, eq, order } = queryClient({ data: ROWS, error: null });
    expect(await fetchSignups(client, 'p', LEADER_ID)).toEqual(ROWS);
    expect(from).toHaveBeenCalledWith(SIGNUPS_TABLE);
    expect(select).toHaveBeenCalledWith(SIGNUP_COLUMNS);
    expect(eq.mock.calls).toEqual([['pack_id', 'p'], ['leader_id', LEADER_ID]]);
    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('drops any row whose leader_id is not the signed-in uid, even if the server returned it', async () => {
    const foreign = { ...ROWS[1], id: '3', leader_id: 'uid-other' };
    const { client } = queryClient({ data: [...ROWS, foreign], error: null });
    expect(await fetchSignups(client, 'p', LEADER_ID)).toEqual(ROWS);
  });

  it('throws the bilingual load error with the PostgREST message', async () => {
    const { client } = queryClient({ data: null, error: { message: 'JWT expired' } });
    await expect(fetchSignups(client, 'p', LEADER_ID)).rejects.toThrow(`${LD_ERR_LOAD}: JWT expired`);
  });
});

describe('signupsToCsv', () => {
  it('writes a BOM, the header, one line per row, quoting embedded quotes, nulls as empty', () => {
    const csv = signupsToCsv(ROWS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split('\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines[1]).toBe('小明,+14085551234,ming@example.org,true,2026-10-02T20:00:00Z');
    expect(lines[2]).toBe('"Ann ""Annie"" Lee",,ann@example.org,false,2026-10-02T21:00:00Z');
    expect(lines[3]).toBe('');
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
