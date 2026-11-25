/**
 * syncLifecycle.test.ts — one login starts the personal sync; sign-out stops it · 登录同步生命周期
 *
 * The fake auth hub keeps authManager's real contract: subscribe() calls the
 * listener at once with the current state, and every session event
 * (including a token refresh for the same user) notifies again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthState } from '../supabase';
import { startSyncLifecycle, FULL_SYNC_DONE_PREFIX, type SyncLifecycleDeps } from '../syncLifecycle';

function authHub() {
  let state: AuthState = { user: null, session: null, isAuthenticated: false, isLoading: true };
  const listeners = new Set<(s: AuthState) => void>();
  return {
    subscribe(l: (s: AuthState) => void) { listeners.add(l); l(state); return () => { listeners.delete(l); }; },
    emit(next: Partial<AuthState> & { uid?: string | null }) {
      const uid = next.uid === undefined ? state.user?.id ?? null : next.uid;
      state = { session: null, isLoading: false, ...next, user: uid ? ({ id: uid } as AuthState['user']) : null, isAuthenticated: !!uid };
      listeners.forEach(l => l(state));
    },
  };
}

let hub: ReturnType<typeof authHub>;
let deps: SyncLifecycleDeps & { [K in 'fullSync' | 'incrementalSync' | 'startPeriodic' | 'stopPeriodic' | 'cancel']: ReturnType<typeof vi.fn> };
let stored: Map<string, string>;
let failed: boolean;
const flush = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
  hub = authHub();
  stored = new Map();
  failed = false;
  deps = {
    subscribe: l => hub.subscribe(l),
    fullSync: vi.fn().mockResolvedValue(undefined),
    incrementalSync: vi.fn().mockResolvedValue(undefined),
    startPeriodic: vi.fn<() => void>(),
    stopPeriodic: vi.fn<() => void>(),
    cancel: vi.fn<() => void>(),
    lastSyncFailed: () => failed,
    storage: { getItem: k => stored.get(k) ?? null, setItem: (k, v) => { stored.set(k, v); } },
  };
});

describe('startSyncLifecycle', () => {
  it('does nothing while the session loads or when signed out', async () => {
    startSyncLifecycle(deps);
    hub.emit({ uid: null });
    await flush();
    expect(deps.fullSync).not.toHaveBeenCalled();
    expect(deps.startPeriodic).not.toHaveBeenCalled();
    expect(deps.stopPeriodic).not.toHaveBeenCalled();
  });

  it('first sign-in for a user on this browser: full sync (pushes local data) + periodic sync', async () => {
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    await flush();
    expect(deps.fullSync).toHaveBeenCalledTimes(1);
    expect(deps.incrementalSync).not.toHaveBeenCalled();
    expect(deps.startPeriodic).toHaveBeenCalledTimes(1);
    expect(stored.get(FULL_SYNC_DONE_PREFIX + 'u1')).toBe('1');
  });

  it('already synced here (e.g. after a page load): incremental sync only', async () => {
    stored.set(FULL_SYNC_DONE_PREFIX + 'u1', '1');
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    await flush();
    expect(deps.incrementalSync).toHaveBeenCalledTimes(1);
    expect(deps.fullSync).not.toHaveBeenCalled();
  });

  it('a token refresh (same user notified again) starts nothing new', async () => {
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    hub.emit({ uid: 'u1' });
    hub.emit({ uid: 'u1' });
    await flush();
    expect(deps.fullSync).toHaveBeenCalledTimes(1);
    expect(deps.startPeriodic).toHaveBeenCalledTimes(1);
  });

  it('a full sync with a failed step leaves the flag unset, so the next sign-in retries it', async () => {
    failed = true;
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    await flush();
    expect(stored.has(FULL_SYNC_DONE_PREFIX + 'u1')).toBe(false);
  });

  it('a thrown sync is logged, not swallowed silently', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    deps.fullSync.mockRejectedValue(new Error('boom'));
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    await flush();
    expect(spy).toHaveBeenCalledWith('[sync] sign-in sync failed:', 'boom');
    spy.mockRestore();
  });

  it('sign-out stops the periodic sync and cancels a running one; local data is not touched', async () => {
    const storageSpy = vi.spyOn(deps.storage, 'setItem');
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    await flush();
    storageSpy.mockClear();
    hub.emit({ uid: null });
    expect(deps.stopPeriodic).toHaveBeenCalledTimes(1);
    expect(deps.cancel).toHaveBeenCalledTimes(1);
    expect(storageSpy).not.toHaveBeenCalled();
    expect(stored.get(FULL_SYNC_DONE_PREFIX + 'u1')).toBe('1');
  });

  it('signing back in (or as another user) starts again', async () => {
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    hub.emit({ uid: null });
    hub.emit({ uid: 'u2' });
    await flush();
    expect(deps.fullSync).toHaveBeenCalledTimes(2);
    expect(deps.startPeriodic).toHaveBeenCalledTimes(2);
  });

  it('starting twice keeps one subscription', async () => {
    startSyncLifecycle(deps);
    startSyncLifecycle(deps);
    hub.emit({ uid: 'u1' });
    await flush();
    expect(deps.fullSync).toHaveBeenCalledTimes(1);
  });
});
