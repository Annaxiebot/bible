/**
 * askHistory.test.ts — the saved Ask AI history's data calls · 问一问记录数据测试 (ADR-0021)
 *
 * A recording fake of the supabase-js query builder: reads and deletes are
 * scoped to the pack AND the uid; the list comes oldest first; saving goes
 * through the RPC with the caller's replace choice; the RPC's full code is
 * 'full' (the notice), every other error a bilingual throw (R5); too-long
 * text never reaches the server.
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  listAskHistory, saveAskExchange, deleteAskExchange, deleteAllAskHistory, fetchReplaceOldest, setReplaceOldest,
  exchangesToMessages, tooLongToSave,
} from '../askHistory';
import {
  ASK_HISTORY_TABLE, SAVE_ASK_EXCHANGE_FN, ASK_HISTORY_FULL_CODE, ASK_REPLACE_COLUMN, ASK_QUESTION_MAX_CHARS, ASK_ANSWER_MAX_CHARS,
} from '../askHistoryRules';
import { AH_ERR_LOAD, AH_ERR_SAVE, AH_ERR_TOO_LONG, AH_ERR_DELETE, AH_ERR_SETTING } from '../askHistoryStrings';

type Result = { data?: unknown; error: { message: string; code?: string } | null };

/** Every builder call is recorded as [method, ...args]; awaiting the chain resolves `result`. */
function fakeClient(result: Result) {
  const calls: unknown[][] = [];
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'delete', 'update']) {
    chain[m] = (...args: unknown[]) => { calls.push([m, ...args]); return chain; };
  }
  chain.maybeSingle = async () => { calls.push(['maybeSingle']); return result; };
  chain.then = (resolve: (r: Result) => unknown) => resolve(result);
  const client = {
    from: (table: string) => { calls.push(['from', table]); return chain; },
    rpc: vi.fn(async (_fn: string, _args: Record<string, unknown>) => result),
  };
  return { client: client as unknown as SupabaseClient, calls, rpc: client.rpc };
}

const EX = { question: '为什么不要忧虑？', answer: '因为天父知道 (v.32).', model: 'google/gemini-2.5-flash' };
const ROWS = [
  { id: 'r1', pack_id: 'p', question: 'Q1', answer: 'A1', model: null, created_at: '2026-10-01T00:00:00Z' },
  { id: 'r2', pack_id: 'p', question: 'Q2', answer: 'A2', model: 'm', created_at: '2026-10-02T00:00:00Z' },
];

describe('askHistory', () => {
  it('list: the pack and the uid, oldest first', async () => {
    const { client, calls } = fakeClient({ data: ROWS, error: null });
    expect(await listAskHistory(client, 'p', 'uid')).toEqual(ROWS);
    expect(calls).toEqual([
      ['from', ASK_HISTORY_TABLE], ['select', 'id, pack_id, question, answer, model, created_at'],
      ['eq', 'pack_id', 'p'], ['eq', 'leader_id', 'uid'], ['order', 'created_at', { ascending: true }],
    ]);
  });

  it('list failure throws the bilingual load line with the server message', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(listAskHistory(client, 'p', 'uid')).rejects.toThrow(`${AH_ERR_LOAD}: boom`);
  });

  it('restored turns: question then answer, in order', () => {
    expect(exchangesToMessages(ROWS)).toEqual([
      { role: 'user', content: 'Q1' }, { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' }, { role: 'assistant', content: 'A2' },
    ]);
  });

  it('save: the RPC with the replace choice; its verdict comes back', async () => {
    const { client, rpc } = fakeClient({ data: 'saved', error: null });
    expect(await saveAskExchange(client, 'p', EX, false)).toBe('saved');
    expect(rpc).toHaveBeenCalledWith(SAVE_ASK_EXCHANGE_FN, {
      p_pack_id: 'p', p_question: EX.question, p_answer: EX.answer, p_model: EX.model, p_replace_oldest: false,
    });
    const replaced = fakeClient({ data: 'replaced', error: null });
    expect(await saveAskExchange(replaced.client, 'p', EX, true)).toBe('replaced');
    expect(replaced.rpc.mock.calls[0][1]).toMatchObject({ p_replace_oldest: true });
  });

  it('save at the limit: the full code is "full", not an error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'ask_ai_history_full', code: ASK_HISTORY_FULL_CODE } });
    expect(await saveAskExchange(client, 'p', EX, false)).toBe('full');
  });

  it('save refused otherwise (not yours, unsynced) or an odd reply: the bilingual save line', async () => {
    const refused = fakeClient({ data: null, error: { message: 'study p is not yours or not synced', code: '42501' } });
    await expect(saveAskExchange(refused.client, 'p', EX, false)).rejects.toThrow(`${AH_ERR_SAVE}: study p is not yours or not synced`);
    const odd = fakeClient({ data: 'weird', error: null });
    await expect(saveAskExchange(odd.client, 'p', EX, false)).rejects.toThrow(AH_ERR_SAVE);
  });

  it('too long: refused before any call, with its own line', async () => {
    const { client, rpc } = fakeClient({ data: 'saved', error: null });
    const longQ = { ...EX, question: 'x'.repeat(ASK_QUESTION_MAX_CHARS + 1) };
    const longA = { ...EX, answer: 'x'.repeat(ASK_ANSWER_MAX_CHARS + 1) };
    expect(tooLongToSave(longQ) && tooLongToSave(longA) && !tooLongToSave(EX)).toBe(true);
    await expect(saveAskExchange(client, 'p', longA, false)).rejects.toThrow(AH_ERR_TOO_LONG);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('delete one / all: scoped to the uid; failures throw the delete line', async () => {
    const one = fakeClient({ error: null });
    await deleteAskExchange(one.client, 'r1', 'uid');
    expect(one.calls).toEqual([['from', ASK_HISTORY_TABLE], ['delete'], ['eq', 'id', 'r1'], ['eq', 'leader_id', 'uid']]);
    const all = fakeClient({ error: null });
    await deleteAllAskHistory(all.client, 'p', 'uid');
    expect(all.calls).toEqual([['from', ASK_HISTORY_TABLE], ['delete'], ['eq', 'pack_id', 'p'], ['eq', 'leader_id', 'uid']]);
    const failed = fakeClient({ error: { message: 'rls' } });
    await expect(deleteAllAskHistory(failed.client, 'p', 'uid')).rejects.toThrow(`${AH_ERR_DELETE}: rls`);
  });

  it('permission: read from the study row (absent → off), turned off by an owner-scoped update', async () => {
    expect(await fetchReplaceOldest(fakeClient({ data: { [ASK_REPLACE_COLUMN]: true }, error: null }).client, 'p', 'uid')).toBe(true);
    expect(await fetchReplaceOldest(fakeClient({ data: null, error: null }).client, 'p', 'uid')).toBe(false);
    const off = fakeClient({ error: null });
    await setReplaceOldest(off.client, 'p', 'uid', false);
    expect(off.calls).toEqual([['from', 'study_packs'], ['update', { [ASK_REPLACE_COLUMN]: false }], ['eq', 'id', 'p'], ['eq', 'leader_id', 'uid']]);
    await expect(setReplaceOldest(fakeClient({ error: { message: 'no' } }).client, 'p', 'uid', false)).rejects.toThrow(`${AH_ERR_SETTING}: no`);
  });
});
