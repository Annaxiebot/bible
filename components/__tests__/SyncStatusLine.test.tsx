/**
 * SyncStatusLine.test.tsx — the #app sync line, and one login for every page · 同步状态一行
 *
 * services/supabase is replaced by an auth hub with authManager's contract
 * (subscribe calls back at once; every session event notifies). A Google
 * sign-in started from the landing nav, the leader AuthPanel or this line
 * reaches the same session, so the personal sync starts and the line flips
 * to "已登录 · 已同步" whichever button was used.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

type State = { user: { id: string; email: string } | null; session: null; isAuthenticated: boolean; isLoading: boolean };
const hub = vi.hoisted(() => {
  let state = { user: null, session: null, isAuthenticated: false, isLoading: false } as State;
  const listeners = new Set<(s: State) => void>();
  const syncListeners = new Set<(s: string) => void>();
  return {
    get state() { return state; },
    listeners, syncListeners,
    emit(uid: string | null) {
      state = { user: uid ? { id: uid, email: `${uid}@example.com` } : null, session: null, isAuthenticated: !!uid, isLoading: false };
      listeners.forEach(l => l(state));
    },
    reset() { state = { user: null, session: null, isAuthenticated: false, isLoading: false }; listeners.clear(); },
  };
});

const signIn = vi.fn();
const signOut = vi.fn();
vi.mock('../../services/supabase', () => ({
  isSupabaseConfigured: () => true,
  authManager: {
    getState: () => hub.state,
    subscribe: (l: (s: State) => void) => { hub.listeners.add(l); l(hub.state); return () => { hub.listeners.delete(l); }; },
    getFullName: () => null,
    signInWithGoogle: () => signIn(),
    signOut: () => signOut(),
  },
  syncManager: {
    getStatus: () => 'idle',
    getLastSyncTime: () => Date.UTC(2026, 9, 5, 9, 30),
    getError: () => null,
    getProgress: () => ({ status: 'idle', completedSteps: [], totalSteps: 0 }),
    subscribe: (l: (s: string) => void) => { hub.syncListeners.add(l); return () => { hub.syncListeners.delete(l); }; },
    subscribeProgress: () => () => undefined,
    cancelSync: vi.fn(),
  },
}));
vi.mock('../../services/syncService', () => ({ syncService: { performFullSync: vi.fn() } }));
const exportAll = vi.fn();
vi.mock('../../services/export/fullBackupExporter', () => ({ exportAndDownloadAll: () => exportAll() }));

import SyncStatusLine from '../SyncStatusLine';
import { SYNC_LINE_LOCAL, SYNC_LINE_SYNCED } from '../syncLineStrings';
import { SETUP_SIGN_OUT } from '../setup/setupStrings';
import LandingLeaderLink from '../landing/LandingLeaderLink';
import { AuthPanel } from '../AuthPanel';
import { authManager } from '../../services/supabase';
import { startSyncLifecycle, type SyncLifecycleDeps } from '../../services/syncLifecycle';

function lifecycle() {
  const fullSync = vi.fn().mockResolvedValue(undefined);
  const deps: SyncLifecycleDeps = {
    subscribe: l => authManager.subscribe(l as never),
    fullSync, incrementalSync: vi.fn().mockResolvedValue(undefined),
    startPeriodic: vi.fn(), stopPeriodic: vi.fn(), cancel: vi.fn(),
    lastSyncFailed: () => false,
    storage: { getItem: () => null, setItem: () => undefined },
  };
  startSyncLifecycle(deps);
  return deps;
}

beforeEach(() => {
  hub.reset();
  signIn.mockReset().mockImplementation(async () => { hub.emit('u1'); return { error: null }; }); // the OAuth round trip, collapsed
  signOut.mockReset().mockImplementation(async () => { hub.emit(null); return { error: null }; });
  exportAll.mockReset().mockResolvedValue({ success: true });
});

describe('SyncStatusLine', () => {
  it('signed out: one line (Chinese first), Google sign-in and Export', () => {
    render(<SyncStatusLine />);
    expect(screen.getByTestId('sync-line-local').textContent).toBe(SYNC_LINE_LOCAL);
    expect(SYNC_LINE_LOCAL.startsWith('未登录：数据只保存在本浏览器')).toBe(true);
    expect(screen.getByTestId('sync-line-signin')).toBeTruthy();
    expect(screen.queryByTestId('sync-line-signed-in')).toBeNull();
  });

  it('Export runs the one exporter; a failure is shown, not swallowed', async () => {
    render(<SyncStatusLine />);
    fireEvent.click(screen.getByTestId('sync-line-export'));
    await waitFor(() => expect(exportAll).toHaveBeenCalledTimes(1));
    exportAll.mockResolvedValue({ success: false, error: 'disk full' });
    fireEvent.click(screen.getByTestId('sync-line-export'));
    expect((await screen.findByRole('alert')).textContent).toContain('disk full');
  });

  it('signed in: "已登录 · 已同步", the last sync time and sign out (which keeps local data)', async () => {
    hub.emit('u1');
    render(<SyncStatusLine />);
    expect(screen.getByTestId('sync-line-signed-in').textContent).toContain(SYNC_LINE_SYNCED);
    expect(screen.getByTestId('sync-line-signed-in').textContent).toContain('上次同步 Last sync');
    expect(screen.queryByTestId('sync-line-export')).toBeNull();
    fireEvent.click(screen.getByText(SETUP_SIGN_OUT));
    await waitFor(() => expect(screen.getByTestId('sync-line-local')).toBeTruthy());
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('one Google login for every page', () => {
  it.each([
    ['the landing nav (LandingLeaderLink)', () => render(<LandingLeaderLink />), 'nav-leader-signin'],
    ['the leader page AuthPanel', () => render(<AuthPanel />), null],
    ['the #app sync line', () => render(<SyncStatusLine />), 'sync-line-signin'],
  ])('sign-in from %s starts the personal sync and the #app line shows synced', async (_name, mount, testId) => {
    const deps = lifecycle();
    mount();
    render(<SyncStatusLine />);
    const button = testId ? screen.getAllByTestId(testId)[0] : screen.getByText('Sign in with Google');
    await act(async () => { fireEvent.click(button); });
    await waitFor(() => expect(deps.fullSync).toHaveBeenCalledTimes(1));
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('sync-line-signed-in')[0].textContent).toContain(SYNC_LINE_SYNCED);
  });

  it('sign-out from the leader AuthPanel stops the personal sync too', async () => {
    const deps = lifecycle();
    hub.emit('u1');
    render(<AuthPanel />);
    await act(async () => { fireEvent.click(screen.getByText('Sign Out')); });
    expect(deps.stopPeriodic).toHaveBeenCalledTimes(1);
  });
});
