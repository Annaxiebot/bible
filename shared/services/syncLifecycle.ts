/**
 * syncLifecycle.ts — one Google login drives the personal app's sync · 登录即同步
 *
 * The personal app (#app), the landing page and the leader pages share one
 * Supabase session (services/supabase authManager), so a sign-in from ANY of
 * them (AuthPanel, LandingLeaderLink, UnclaimedSignIn, the #app sync line)
 * lands here (ADR-0010):
 *   - signed in as a user this browser has never fully synced → full sync
 *     (pushes everything saved locally while signed out, pulls the rest);
 *   - signed in as a user already synced here → incremental sync;
 *   - either way the 5-minute periodic sync starts.
 *   - signed out → the periodic sync stops and any running sync is cancelled.
 *     Local data is never touched: it stays in this browser.
 * Token refreshes re-notify with the same user and do nothing.
 */
import { authManager, syncManager, type AuthState } from './supabase';
import { syncService } from './syncService';

/** localStorage prefix: "<prefix><uid>" = "1" once a full sync finished cleanly for that user here. */
export const FULL_SYNC_DONE_PREFIX = 'bible_sync_full_done:';

export interface SyncLifecycleDeps {
  subscribe: (listener: (state: AuthState) => void) => () => void;
  fullSync: () => Promise<void>;
  incrementalSync: () => Promise<void>;
  startPeriodic: () => void;
  stopPeriodic: () => void;
  cancel: () => void;
  /** True when the last full sync ended with a failed step (syncManager status 'error'). */
  lastSyncFailed: () => boolean;
  storage: Pick<Storage, 'getItem' | 'setItem'>;
}

function defaultDeps(): SyncLifecycleDeps {
  return {
    subscribe: listener => authManager.subscribe(listener),
    fullSync: () => syncService.performFullSync(),
    incrementalSync: () => syncService.performIncrementalSync(),
    startPeriodic: () => syncService.startPeriodicSync(),
    stopPeriodic: () => syncService.stopPeriodicSync(),
    cancel: () => syncManager.cancelSync(),
    lastSyncFailed: () => syncManager.getStatus() === 'error',
    storage: localStorage,
  };
}

async function syncOnSignIn(uid: string, deps: SyncLifecycleDeps): Promise<void> {
  const doneKey = FULL_SYNC_DONE_PREFIX + uid;
  if (deps.storage.getItem(doneKey)) {
    await deps.incrementalSync();
    return;
  }
  await deps.fullSync();
  // A failed step keeps the flag unset, so the next sign-in / page load retries the full sync.
  if (!deps.lastSyncFailed()) deps.storage.setItem(doneKey, '1');
}

/** Subscribe once; returns the unsubscribe. Safe to call again (the earlier subscription is replaced). */
let stopCurrent: (() => void) | null = null;

export function startSyncLifecycle(deps: SyncLifecycleDeps = defaultDeps()): () => void {
  stopCurrent?.();
  let currentUid: string | null = null;
  const unsubscribe = deps.subscribe(state => {
    if (state.isLoading) return;
    const uid = state.isAuthenticated ? state.user?.id ?? null : null;
    if (uid === currentUid) return; // token refresh / repeat notify
    const wasSignedIn = currentUid !== null;
    currentUid = uid;
    if (uid) {
      deps.startPeriodic();
      syncOnSignIn(uid, deps).catch(err => {
        // R5: performFullSync already set syncManager to 'error' (the sync line shows it); keep it greppable too.
        console.error('[sync] sign-in sync failed:', err instanceof Error ? err.message : String(err));
      });
    } else if (wasSignedIn) {
      deps.stopPeriodic();
      deps.cancel();
    }
  });
  stopCurrent = () => { unsubscribe(); stopCurrent = null; };
  return stopCurrent;
}
