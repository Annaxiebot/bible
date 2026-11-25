/**
 * packShare.test.ts — the share link's pure layer (ADR-0026): token shape,
 * route parsing, URL building, and the sharing reads/writes against a stub
 * client (owner-scoped updates, token kept across off/on).
 */
import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import {
  getShareTokenFromHash, shareHash, newShareToken, fetchSharedPack, setPackSharing, getPackSharing,
  markSharedPackViewed, viewedGuardKey,
} from '../packShare';
import { resolveRootView } from '../../landing/landingRoute';
import { TEST_PACK_PATH } from './fixtures';

const TOKEN = 'AbC123_-xYz987654321uV';

describe('share tokens and the member route', () => {
  it('newShareToken: 22 base64url chars, unguessable per call', () => {
    const a = newShareToken();
    const b = newShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
    expect(getShareTokenFromHash(shareHash(a))).toBe(a);
  });
  it('parses only "#/view/<token>" with a plausible token', () => {
    expect(getShareTokenFromHash(`#/view/${TOKEN}`)).toBe(TOKEN);
    expect(getShareTokenFromHash('#/view/short')).toBeNull();     // < 16 chars
    expect(getShareTokenFromHash('#/view/')).toBeNull();
    expect(getShareTokenFromHash(`#/pack/${TOKEN}`)).toBeNull();
    expect(getShareTokenFromHash(`#/view/${TOKEN}/extra`)).toBeNull();
  });
  it('the member route renders through the pack gate', () => {
    expect(resolveRootView(`#/view/${TOKEN}`)).toBe('pack');
    expect(resolveRootView('#/view/short')).toBe('app'); // not a share link — the old fallback
  });
});

/** A stub client: rpc resolves `rpcData`; from().update/select chains record their args. */
function stubClient(rpcData: unknown) {
  const calls: { update?: Record<string, unknown>; eq: Array<[string, string]> } = { eq: [] };
  const chain = {
    update: (patch: Record<string, unknown>) => { calls.update = patch; return chain; },
    select: () => chain,
    eq: (col: string, val: string) => { calls.eq.push([col, val]); return chain; },
    maybeSingle: () => Promise.resolve({ data: { shared: true, share_token: TOKEN, share_views: 3 }, error: null }),
    then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
  };
  const client = {
    rpc: vi.fn().mockResolvedValue({ data: rpcData, error: null }),
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe('sharing reads and writes', () => {
  const pack = JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8'));

  it('fetchSharedPack parses the RPC pack; a dead token is null, never an error', async () => {
    const live = await fetchSharedPack(stubClient(pack).client, TOKEN);
    expect(live?.title).toContain('不要忧虑');
    const dead = await fetchSharedPack(stubClient(null).client, TOKEN);
    expect(dead).toBeNull();
  });

  it('start sharing mints a token only when none exists, and scopes the update to the owner', async () => {
    const fresh = stubClient(null);
    const minted = await setPackSharing(fresh.client, 'p1', 'uid-1', true, { shareToken: null, views: 0 });
    expect(minted.shared).toBe(true);
    expect(minted.shareToken).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(fresh.calls.update).toEqual({ shared: true, share_token: minted.shareToken });
    expect(fresh.calls.eq).toEqual([['id', 'p1'], ['leader_id', 'uid-1']]);

    const again = stubClient(null);
    const kept = await setPackSharing(again.client, 'p1', 'uid-1', true, { shareToken: TOKEN, views: 2 });
    expect(kept.shareToken).toBe(TOKEN); // the link stays stable across off/on
  });

  it('stop sharing flips the flag but keeps the token for a later re-share', async () => {
    const stub = stubClient(null);
    const off = await setPackSharing(stub.client, 'p1', 'uid-1', false, { shareToken: TOKEN, views: 5 });
    expect(off).toEqual({ shared: false, shareToken: TOKEN, views: 5 });
    expect(stub.calls.update).toEqual({ shared: false });
  });

  it('getPackSharing reads the owner-scoped row, views included', async () => {
    const stub = stubClient(null);
    const state = await getPackSharing(stub.client, 'p1', 'uid-1');
    expect(state).toEqual({ shared: true, shareToken: TOKEN, views: 3 });
    expect(stub.calls.eq).toEqual([['id', 'p1'], ['leader_id', 'uid-1']]);
  });

  it('markSharedPackViewed counts a device ONCE: the localStorage guard stops reload inflation', () => {
    // The global setup stubs localStorage with no-op mocks; back it with a real
    // map here, or the guard could never hold and the test would miss the bug.
    const store = new Map<string, string>();
    vi.mocked(localStorage.getItem).mockImplementation(k => store.get(k) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((k, v) => { store.set(k, v); });
    const stub = stubClient(null);
    markSharedPackViewed(stub.client, TOKEN);
    markSharedPackViewed(stub.client, TOKEN);
    expect(stub.client.rpc).toHaveBeenCalledTimes(1);
    expect(stub.client.rpc).toHaveBeenCalledWith('public_shared_pack_viewed', { p_token: TOKEN });
    expect(localStorage.getItem(viewedGuardKey(TOKEN))).toBe('1');
    vi.mocked(localStorage.getItem).mockReset();
    vi.mocked(localStorage.setItem).mockReset();
  });
});
