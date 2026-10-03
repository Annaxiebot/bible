/**
 * packSourceRemote.test.ts — where loadPack looks, in order · 查经包读取顺序
 *
 * A "local-" id: this browser's IndexedDB first (no server call), then the
 * signed-in leader's study_packs row (kept locally once found), else the
 * not-found line. Signed out or unconfigured never asks the server. Any
 * other id is still the committed public JSON. Real fake-indexeddb; the
 * Supabase client is the in-memory study_packs table.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { parseStudyPack } from '../packTypes';
import { TEST_PACK_PATH, SAMPLE_PACK_ID } from './fixtures';
import { idbService } from '../../../services/idbService';
import { makeFakeStudyPacks } from '../../newstudy/__tests__/fakeStudyPacks';
import { PS_ERR_PULL } from '../../newstudy/packSyncStrings';

let uid: string | null = 'uid-lead';
let configured = true;
let fake = makeFakeStudyPacks();
vi.mock('../../../services/supabase', () => ({
  get supabase() { return configured ? fake.client : null; },
  authManager: { getState: () => ({ isAuthenticated: !!uid }), getUserId: () => uid },
}));

import { loadPack, saveLocalPack, getLocalPack, listLocalPacks, LOCAL_PACK_NOT_FOUND } from '../packSource';

const sample = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const ID = 'local-2026-10-02-matt6';
const owned = (title: string) => ({ ...sample, id: ID, title, leaderId: 'uid-lead' });

beforeEach(async () => {
  uid = 'uid-lead';
  configured = true;
  fake = makeFakeStudyPacks();
  await idbService.clear('studypacks');
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('loadPack order for a local id', () => {
  it('1. IndexedDB first: the server is not asked', async () => {
    await saveLocalPack(owned('here'));
    fake.rows.set(ID, { id: ID, leader_id: 'uid-lead', title: 'there', pack: owned('there') });
    expect((await loadPack(ID)).title).toBe('here');
    expect(fake.calls.select).toBe(0);
  });

  it('2. signed in and not on this device: the leader\'s study_packs row, then kept locally (marked synced)', async () => {
    fake.rows.set(ID, { id: ID, leader_id: 'uid-lead', title: 'there', pack: owned('there') });
    expect((await loadPack(ID)).title).toBe('there');
    expect((await getLocalPack(ID))?.title).toBe('there');
    expect((await listLocalPacks()).synced.has(ID)).toBe(true);
  });

  it('another leader\'s row is never returned (uid filter on top of RLS)', async () => {
    fake.rows.set(ID, { id: ID, leader_id: 'uid-other', title: 'theirs', pack: { ...owned('theirs'), leaderId: 'uid-other' } });
    await expect(loadPack(ID)).rejects.toThrow(LOCAL_PACK_NOT_FOUND);
  });

  it('3. signed out or unconfigured: not found, no server call', async () => {
    fake.rows.set(ID, { id: ID, leader_id: 'uid-lead', title: 'there', pack: owned('there') });
    uid = null;
    await expect(loadPack(ID)).rejects.toThrow(LOCAL_PACK_NOT_FOUND);
    uid = 'uid-lead';
    configured = false;
    await expect(loadPack(ID)).rejects.toThrow(LOCAL_PACK_NOT_FOUND);
    expect(fake.calls.select).toBe(0);
  });

  it('a server error is surfaced, not turned into "not found"', async () => {
    fake.errors.select = 'JWT expired';
    await expect(loadPack(ID)).rejects.toThrow(`${PS_ERR_PULL}: JWT expired`);
  });
});

describe('loadPack for a committed id', () => {
  it('fetches public/packs JSON and never asks study_packs', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => sample }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await loadPack(SAMPLE_PACK_ID)).id).toBe(SAMPLE_PACK_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fake.calls.select).toBe(0);
  });
});
