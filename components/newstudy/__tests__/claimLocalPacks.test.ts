/**
 * claimLocalPacks.test.ts — a sign-in claims this browser's ownerless packs · 登录认领测试
 *
 * Real fake-indexeddb; services/supabase (session) and the summary sync are
 * mocked. Only packs without leaderId are stamped; a second run claims
 * nothing; every claimed pack's summary is synced; a failed sync is a
 * failure line, not a throw; the auth listener runs once per uid and
 * announces the result on the window event.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { claimLocalPacks, installClaimOnSignIn, useLocalPackClaim, LOCAL_PACKS_CLAIMED_EVENT, ClaimResult } from '../claimLocalPacks';
import { saveLocalPack, getLocalPack } from '../../studypack/packSource';
import { idbService } from '../../../services/idbService';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { SU_CLAIM_FAILED } from '../../signup/signupStrings';

type Listener = (state: { user: { id: string } | null }) => void;
let listener: Listener | null = null;
vi.mock('../../../services/supabase', () => ({
  authManager: {
    getUserId: () => null,
    subscribe: (l: Listener) => { listener = l; return () => { listener = null; }; },
  },
}));
const syncMock = vi.fn();
vi.mock('../../signup/packSummary', () => ({ syncPackSummary: (pack: unknown) => syncMock(pack) }));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const base = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));
const unclaimed = { ...base, id: 'local-2026-10-02-jhn3' };
const owned = { ...base, id: 'local-2026-10-09-mat6', leaderId: 'uid-other' };

describe('claimLocalPacks', () => {
  beforeEach(async () => {
    syncMock.mockReset().mockResolvedValue({ status: 'synced' });
    await idbService.clear('studypacks');
    await saveLocalPack(unclaimed);
    await saveLocalPack(owned);
  });

  it('stamps only the packs without a leader, syncs each, and is idempotent', async () => {
    const first = await claimLocalPacks('uid-lead');
    expect(first).toEqual({ claimed: [unclaimed.id], failures: [] });
    expect((await getLocalPack(unclaimed.id))?.leaderId).toBe('uid-lead');
    expect((await getLocalPack(owned.id))?.leaderId).toBe('uid-other');
    expect(syncMock).toHaveBeenCalledTimes(1);
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ id: unclaimed.id, leaderId: 'uid-lead' }));

    const second = await claimLocalPacks('uid-lead');
    expect(second).toEqual({ claimed: [], failures: [] });
    expect(syncMock).toHaveBeenCalledTimes(1);
  });

  it('a failed summary sync is reported as a failure line; the pack is still claimed', async () => {
    syncMock.mockResolvedValue({ status: 'failed', message: 'RLS' });
    const result = await claimLocalPacks('uid-lead');
    expect(result.claimed).toEqual([unclaimed.id]);
    expect(result.failures).toEqual([`${unclaimed.id}: RLS`]);
    expect((await getLocalPack(unclaimed.id))?.leaderId).toBe('uid-lead');
  });
});

describe('installClaimOnSignIn + useLocalPackClaim', () => {
  beforeEach(async () => {
    syncMock.mockReset().mockResolvedValue({ status: 'synced' });
    await idbService.clear('studypacks');
    await saveLocalPack(unclaimed);
  });

  it('claims once per signed-in uid and announces the ids; the page hook bumps its version for its pack', async () => {
    const events: ClaimResult[] = [];
    const onEvent = (e: Event) => events.push((e as CustomEvent<ClaimResult>).detail);
    window.addEventListener(LOCAL_PACKS_CLAIMED_EVENT, onEvent);
    const { result } = renderHook(() => useLocalPackClaim(unclaimed.id));
    const other = renderHook(() => useLocalPackClaim('local-other'));
    const unsubscribe = installClaimOnSignIn();
    expect(listener).not.toBeNull();

    await act(async () => {
      listener!({ user: null });
      listener!({ user: { id: 'uid-lead' } });
      listener!({ user: { id: 'uid-lead' } });   // same uid again: no second claim
      await vi.waitFor(() => expect(events).toHaveLength(1));
    });
    expect(events[0]).toEqual({ claimed: [unclaimed.id], failures: [] });
    expect(result.current).toEqual({ version: 1, failure: null });
    expect(other.result.current).toEqual({ version: 0, failure: null });
    expect(syncMock).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.removeEventListener(LOCAL_PACKS_CLAIMED_EVENT, onEvent);
  });

  it('a storage failure becomes a failure line on the event (never swallowed)', async () => {
    const getAll = vi.spyOn(idbService, 'getAll').mockRejectedValueOnce(new Error('idb closed'));
    const { result } = renderHook(() => useLocalPackClaim(unclaimed.id));
    const unsubscribe = installClaimOnSignIn();
    act(() => { listener!({ user: { id: 'uid-lead' } }); });
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toBe(`${SU_CLAIM_FAILED}: ${SU_CLAIM_FAILED}: idb closed`);
    expect(result.current.version).toBe(0);
    getAll.mockRestore();
    unsubscribe();
  });
});
