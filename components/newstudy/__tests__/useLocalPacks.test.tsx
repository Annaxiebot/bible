/**
 * useLocalPacks.test.tsx — save stamps the owner and refreshes the summary · 本地包保存测试
 *
 * Real fake-indexeddb underneath; services/supabase (session) and the
 * summary sync are mocked. Signed in: the stored pack carries leaderId and
 * the summary is synced; a failed sync lands in `error`. Signed out: the
 * pack stays a demo pack and nothing is synced.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLocalPacks } from '../useLocalPacks';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { getLocalPack, deleteLocalPack } from '../../studypack/packSource';

let uid: string | null = null;
vi.mock('../../../services/supabase', () => ({ authManager: { getUserId: () => uid } }));
const syncMock = vi.fn();
vi.mock('../../signup/packSummary', () => ({ syncPackSummary: (pack: unknown) => syncMock(pack) }));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

describe('useLocalPacks.save', () => {
  beforeEach(async () => {
    syncMock.mockReset().mockResolvedValue({ status: 'synced' });
    await deleteLocalPack(pack.id);
  });

  it('signed in: stores the pack with the leader uid and syncs its summary', async () => {
    uid = 'uid-lead';
    const { result } = renderHook(() => useLocalPacks());
    await act(() => result.current.save(pack));
    expect((await getLocalPack(pack.id))?.leaderId).toBe('uid-lead');
    expect(syncMock).toHaveBeenCalledWith(expect.objectContaining({ id: pack.id, leaderId: 'uid-lead' }));
    await waitFor(() => expect(result.current.packs.map(p => p.id)).toContain(pack.id));
    expect(result.current.error).toBeNull();
  });

  it('signed out: the pack stays a demo pack (no leaderId); the sync helper decides to skip', async () => {
    uid = null;
    syncMock.mockResolvedValue({ status: 'skipped' });
    const { result } = renderHook(() => useLocalPacks());
    await act(() => result.current.save(pack));
    expect((await getLocalPack(pack.id))?.leaderId).toBeUndefined();
    expect(syncMock).toHaveBeenCalledWith(expect.not.objectContaining({ leaderId: expect.anything() }));
  });

  it('a failed summary sync is shown in error (the pack is still saved)', async () => {
    uid = 'uid-lead';
    syncMock.mockResolvedValue({ status: 'failed', message: 'sync boom' });
    const { result } = renderHook(() => useLocalPacks());
    await act(() => result.current.save(pack));
    expect(await getLocalPack(pack.id)).not.toBeNull();
    await waitFor(() => expect(result.current.error).toBe('sync boom'));
  });
});
