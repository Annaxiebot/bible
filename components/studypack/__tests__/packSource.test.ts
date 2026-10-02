/**
 * packSource.test.ts — local packs round-trip through IndexedDB
 * (fake-indexeddb from tests/utils/setup.ts, the real idbService), and
 * loadPack picks IndexedDB for "local-" ids and public/packs otherwise.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import {
  loadPack, saveLocalPack, getLocalPack, listLocalPacks, deleteLocalPack, isLocalPackId, makeLocalPackId,
  LOCAL_PACK_NOT_FOUND, LOCAL_PACK_PREFIX,
} from '../packSource';
import { parseStudyPack, StudyPack } from '../packTypes';
import { idbService } from '../../../services/idbService';
import { SAMPLE_PACK_ID, TEST_PACK_PATH } from './fixtures';

const sample: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const local = (id: string): StudyPack => ({ ...sample, id });

describe('local pack ids', () => {
  it('builds and recognizes "local-<date>-<book><ch>"', () => {
    const id = makeLocalPackId('2026-10-02', 'JHN', 3);
    expect(id).toBe('local-2026-10-02-jhn3');
    expect(isLocalPackId(id)).toBe(true);
    expect(isLocalPackId(SAMPLE_PACK_ID)).toBe(false);
    expect(id.startsWith(LOCAL_PACK_PREFIX)).toBe(true);
  });
});

describe('IndexedDB store', () => {
  beforeEach(async () => { await idbService.clear('studypacks'); });

  it('saves, reads back, lists newest-first and deletes', async () => {
    await saveLocalPack(local('local-2026-10-02-jhn3'));
    await new Promise(r => setTimeout(r, 2));
    await saveLocalPack(local('local-2026-10-09-mat6'));
    expect((await getLocalPack('local-2026-10-02-jhn3'))?.title).toBe(sample.title);
    const listed = await listLocalPacks();
    expect(listed.packs.map(p => p.id)).toEqual(['local-2026-10-09-mat6', 'local-2026-10-02-jhn3']);
    expect(listed.invalid).toEqual([]);
    await deleteLocalPack('local-2026-10-02-jhn3');
    expect(await getLocalPack('local-2026-10-02-jhn3')).toBeNull();
  });

  it('refuses a non-local id (TV mode would try to fetch it)', async () => {
    await expect(saveLocalPack(local(SAMPLE_PACK_ID))).rejects.toThrow(LOCAL_PACK_PREFIX);
  });

  it('lists an unreadable record as invalid instead of hiding it', async () => {
    await idbService.put('studypacks', { id: 'local-broken', pack: { nope: true }, savedAt: 1 });
    const listed = await listLocalPacks();
    expect(listed.packs).toEqual([]);
    expect(listed.invalid).toEqual(['local-broken']);
  });
});

describe('loadPack', () => {
  beforeEach(async () => {
    await idbService.clear('studypacks');
    vi.unstubAllGlobals();
  });

  it('reads "local-" ids from IndexedDB without touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await saveLocalPack(local('local-2026-10-02-jhn3'));
    const pack = await loadPack('local-2026-10-02-jhn3');
    expect(pack.id).toBe('local-2026-10-02-jhn3');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a missing local pack bilingually', async () => {
    await expect(loadPack('local-missing')).rejects.toThrow(LOCAL_PACK_NOT_FOUND);
  });

  it('fetches every other id from public/packs as before', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => sample });
    vi.stubGlobal('fetch', fetchMock);
    const pack = await loadPack(SAMPLE_PACK_ID);
    expect(pack.id).toBe(SAMPLE_PACK_ID);
    expect(fetchMock.mock.calls[0][0]).toContain(`packs/${SAMPLE_PACK_ID}.json`);
  });
});
