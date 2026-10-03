/**
 * packSync.test.ts — a signed-in leader's packs follow them · 查经包同步测试
 *
 * Real fake-indexeddb underneath (packSource); services/supabase is mocked
 * with an in-memory study_packs table (fakeStudyPacks). Covers: push on
 * save only when signed in and only own packs; a burst coalesces into one
 * push after the debounce and marks the copy synced; sign-in merge
 * (newer-wins both ways, server-only stored, local-only pushed, synced-then-
 * missing dropped, unreadable rows reported but never acted on); delete
 * (server first, a failed server delete keeps the local copy); signed-out
 * and unconfigured are no-ops; every server error is a typed failure on
 * the status.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { parseStudyPack, StudyPack } from '../../studypack/packTypes';
import { TEST_PACK_PATH } from '../../studypack/__tests__/fixtures';
import { saveLocalPack, saveSyncedPack, getLocalPack, listLocalPacks } from '../../studypack/packSource';
import { idbService } from '../../../services/idbService';
import { makeFakeStudyPacks } from './fakeStudyPacks';

let uid: string | null = 'uid-lead';
let configured = true;
let fake = makeFakeStudyPacks();
vi.mock('../../../services/supabase', () => ({
  get supabase() { return configured ? fake.client : null; },
  authManager: { getState: () => ({ isAuthenticated: !!uid }), getUserId: () => uid },
}));

import {
  PACK_PUSH_DEBOUNCE_MS, planPackMerge, stampUpdated, schedulePackPush, pushPack, syncPacksOnSignIn,
  deletePackEverywhere, subscribePackSyncStatus, resetPackSync, type PackSyncStatus,
} from '../packSync';
import { PS_ERR_PUSH, PS_ERR_PULL, PS_ERR_DELETE, PS_ERR_INVALID_REMOTE } from '../packSyncStrings';

const sample = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const T1 = new Date('2026-10-01T10:00:00Z');
const T2 = new Date('2026-10-02T10:00:00Z');
const pack = (id: string, at: Date | null, leaderId: string | undefined = 'uid-lead', title = sample.title): StudyPack => {
  const base = { ...sample, id, title, leaderId };
  return at ? stampUpdated(base, at) : base;
};
const row = (p: StudyPack) => ({ id: p.id, leader_id: p.leaderId!, title: p.title, pack: p });

let statuses: PackSyncStatus[] = [];
let unsubscribe: () => void = () => undefined;

beforeEach(async () => {
  uid = 'uid-lead';
  configured = true;
  fake = makeFakeStudyPacks();
  await idbService.clear('studypacks');
  statuses = [];
  unsubscribe = subscribePackSyncStatus(s => statuses.push(s));
});
afterEach(() => { resetPackSync(); unsubscribe(); vi.useRealTimers(); });

describe('planPackMerge (pure)', () => {
  const local = (packs: StudyPack[], synced: string[] = []) => ({ packs, synced: new Set(synced) });

  it('newer wins both ways; a tie keeps the server copy; server-only is stored', () => {
    const plan = planPackMerge(
      local([pack('local-a', T2, 'uid-lead', 'A here'), pack('local-b', T1), pack('local-c', T1)]),
      { packs: [pack('local-a', T1), pack('local-b', T2, 'uid-lead', 'B there'), pack('local-c', T1), pack('local-d', T1)], invalid: [] },
      'uid-lead',
    );
    expect(plan.push.map(p => p.title)).toEqual(['A here']);
    expect(plan.store.map(p => p.id)).toEqual(['local-b', 'local-c', 'local-d']);
    expect(plan.store[0].title).toBe('B there');
    expect(plan.dropLocal).toEqual([]);
  });

  it('local-only: never synced → push; synced before → dropped (deleted on another device); other leaders and unreadable rows are left alone', () => {
    const plan = planPackMerge(
      local([pack('local-new', T1), pack('local-gone', T1), pack('local-other', T1, 'uid-other'), pack('local-broken', T1)], ['local-gone', 'local-broken']),
      { packs: [], invalid: ['local-broken'] },
      'uid-lead',
    );
    expect(plan.push.map(p => p.id)).toEqual(['local-new']);
    expect(plan.dropLocal).toEqual(['local-gone']);
    expect(plan.store).toEqual([]);
  });

  it('a pack saved before updatedAt existed loses to any stamped copy', () => {
    const plan = planPackMerge(local([pack('local-a', null)]), { packs: [pack('local-a', T1)], invalid: [] }, 'uid-lead');
    expect(plan.store.map(p => p.id)).toEqual(['local-a']);
  });
});

describe('push on save', () => {
  it('signed in: a burst of saves to one pack becomes ONE upsert after the debounce, and the local copy is marked synced', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const first = pack('local-a', T1, 'uid-lead', 'first');
    const last = pack('local-a', T2, 'uid-lead', 'last');
    await saveLocalPack(last);
    schedulePackPush(first);
    schedulePackPush(last);
    await vi.advanceTimersByTimeAsync(PACK_PUSH_DEBOUNCE_MS - 1);
    expect(fake.calls.upsert).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitUntil(() => statuses.at(-1)?.state === 'synced');
    expect(fake.calls.upsert).toEqual([row(last)]);
    expect((await listLocalPacks()).synced.has('local-a')).toBe(true);
  });

  it('signed out, unconfigured, or someone else\'s pack: nothing is sent', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    uid = null;
    schedulePackPush(pack('local-a', T1));
    uid = 'uid-lead';
    configured = false;
    schedulePackPush(pack('local-b', T1));
    expect(await pushPack(pack('local-b', T1))).toEqual({ ok: true, skipped: true });
    configured = true;
    schedulePackPush(pack('local-c', T1, 'uid-other'));
    await vi.advanceTimersByTimeAsync(PACK_PUSH_DEBOUNCE_MS * 2);
    expect(fake.calls.upsert).toHaveLength(0);
    expect(statuses.map(s => s.state)).toEqual(['idle']);
  });

  it('a server error becomes a typed push failure on the status; the local copy stays unsynced', async () => {
    fake.errors.upsert = 'permission denied';
    const p = pack('local-a', T1);
    await saveLocalPack(p);
    const result = await pushPack(p);
    expect(result).toEqual({ ok: false, failure: { step: 'push', message: `${PS_ERR_PUSH}: permission denied` } });
    expect((await listLocalPacks()).synced.has('local-a')).toBe(false);
  });
});

describe('syncPacksOnSignIn', () => {
  it('pulls server packs, keeps the newer copy, pushes local-only packs, drops packs deleted elsewhere', async () => {
    fake.rows.set('local-server', row(pack('local-server', T1, 'uid-lead', 'from server')));
    fake.rows.set('local-newer-there', row(pack('local-newer-there', T2, 'uid-lead', 'server wins')));
    fake.rows.set('local-newer-here', row(pack('local-newer-here', T1, 'uid-lead', 'old on server')));
    await saveLocalPack(pack('local-newer-there', T1, 'uid-lead', 'old here'));
    await saveLocalPack(pack('local-newer-here', T2, 'uid-lead', 'local wins'));
    await saveLocalPack(pack('local-only', T1));
    await saveSyncedPack(pack('local-deleted-elsewhere', T1));

    expect(await syncPacksOnSignIn()).toEqual({ ok: true, skipped: false });
    expect(statuses.map(s => s.state)).toEqual(['idle', 'syncing', 'synced']);
    expect((await getLocalPack('local-server'))?.title).toBe('from server');
    expect((await getLocalPack('local-newer-there'))?.title).toBe('server wins');
    expect(fake.rows.get('local-newer-here')?.title).toBe('local wins');
    expect(fake.rows.has('local-only')).toBe(true);
    expect(await getLocalPack('local-deleted-elsewhere')).toBeNull();
    expect((await listLocalPacks()).synced).toEqual(new Set(['local-server', 'local-newer-there', 'local-newer-here', 'local-only']));
  });

  it('a pull error is a typed failure and nothing local changes', async () => {
    fake.errors.select = 'JWT expired';
    await saveSyncedPack(pack('local-a', T1));
    expect(await syncPacksOnSignIn()).toEqual({ ok: false, failure: { step: 'pull', message: `${PS_ERR_PULL}: JWT expired` } });
    expect(statuses.at(-1)).toEqual({ state: 'failed', failure: { step: 'pull', message: `${PS_ERR_PULL}: JWT expired` } });
    expect(await getLocalPack('local-a')).not.toBeNull();
  });

  it('an unreadable server row is reported and its local copy is kept', async () => {
    fake.rows.set('local-broken', { id: 'local-broken', leader_id: 'uid-lead', title: 'x', pack: { nope: true } });
    await saveSyncedPack(pack('local-broken', T1));
    const result = await syncPacksOnSignIn();
    expect(result).toEqual({ ok: false, failure: { step: 'pull', message: `${PS_ERR_INVALID_REMOTE}: local-broken` } });
    expect(await getLocalPack('local-broken')).not.toBeNull();
  });

  it('signed out or unconfigured: skipped, no request', async () => {
    uid = null;
    expect(await syncPacksOnSignIn()).toEqual({ ok: true, skipped: true });
    uid = 'uid-lead';
    configured = false;
    expect(await syncPacksOnSignIn()).toEqual({ ok: true, skipped: true });
    expect(fake.calls.select).toBe(0);
  });
});

describe('deletePackEverywhere', () => {
  it('signed in, own pack: deletes the row (scoped to the uid) and then the local copy', async () => {
    const p = pack('local-a', T1);
    fake.rows.set(p.id, row(p));
    await saveSyncedPack(p);
    expect(await deletePackEverywhere(p.id)).toEqual({ ok: true, skipped: false });
    expect(fake.calls.delete).toEqual([{ id: 'local-a', leader_id: 'uid-lead' }]);
    expect(fake.rows.has(p.id)).toBe(false);
    expect(await getLocalPack(p.id)).toBeNull();
  });

  it('a failed server delete keeps the local copy and is a typed failure on the status', async () => {
    fake.errors.delete = 'network down';
    await saveSyncedPack(pack('local-a', T1));
    const result = await deletePackEverywhere('local-a');
    expect(result).toEqual({ ok: false, failure: { step: 'delete', message: `${PS_ERR_DELETE}: network down` } });
    expect(statuses.at(-1)?.state).toBe('failed');
    expect(await getLocalPack('local-a')).not.toBeNull();
  });

  it('signed out, or another leader\'s pack: local delete only', async () => {
    await saveLocalPack(pack('local-a', T1));
    await saveLocalPack(pack('local-b', T1, 'uid-other'));
    uid = null;
    expect(await deletePackEverywhere('local-a')).toEqual({ ok: true, skipped: true });
    uid = 'uid-lead';
    expect(await deletePackEverywhere('local-b')).toEqual({ ok: true, skipped: true });
    expect(fake.calls.delete).toEqual([]);
    expect((await listLocalPacks()).packs).toEqual([]);
  });

  it('cancels a pending push of the deleted pack', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const p = pack('local-a', T1);
    await saveLocalPack(p);
    schedulePackPush(p);
    await deletePackEverywhere(p.id);
    await vi.advanceTimersByTimeAsync(PACK_PUSH_DEBOUNCE_MS * 2);
    expect(fake.calls.upsert).toEqual([]);
    expect(fake.rows.has(p.id)).toBe(false);
  });
});
