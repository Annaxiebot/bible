/**
 * SyncStatusLine.tsx — the personal app's one sync line · 同步状态一行
 *
 * Signed out: says the data stays in this browser, offers Google sign-in
 * (useGoogleSignIn, the same hook as every other sign-in button) and
 * "导出 Export" (the one exporter, services/export/fullBackupExporter).
 * Signed in: "已登录 · 已同步", the last sync time and sign out. The session is
 * the one the landing / leader pages use (useLeaderSession), so a sign-in
 * anywhere shows here; services/syncLifecycle starts / stops the sync
 * (ADR-0010). Sign-out keeps every local record.
 */
import React, { useEffect, useState } from 'react';
import { authManager, syncManager, type SyncStatus } from '../services/supabase';
import { useLeaderSession } from './leader/useLeaderSession';
import { useGoogleSignIn } from './signup/useGoogleSignIn';
import { exportAndDownloadAll } from '../services/export/fullBackupExporter';
import { SU_SIGN_IN_GOOGLE as SIGN_IN, SU_SIGNING_IN as SIGNING_IN } from './signup/signupStrings';
import { SETUP_SIGN_OUT as SIGN_OUT } from './setup/setupStrings';
import {
  SYNC_LINE_LOCAL, SYNC_LINE_SYNCED, SYNC_LINE_SYNCING, SYNC_LINE_ERROR,
  SYNC_LINE_EXPORT as EXPORT, SYNC_LINE_LAST_SYNC as LAST_SYNC,
} from './syncLineStrings';

const btn = 'px-2 py-1 rounded border border-slate-300 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function useSyncStatus(): { status: SyncStatus; lastSync: number | null; error: string | null } {
  const [status, setStatus] = useState<SyncStatus>(syncManager.getStatus());
  useEffect(() => syncManager.subscribe(setStatus), []);
  return { status, lastSync: syncManager.getLastSyncTime(), error: syncManager.getError() };
}

function signedInText(status: SyncStatus, error: string | null): string {
  if (status === 'syncing') return SYNC_LINE_SYNCING;
  if (status === 'error') return error ? `${SYNC_LINE_ERROR}: ${error}` : SYNC_LINE_ERROR;
  return SYNC_LINE_SYNCED;
}

const SyncStatusLine: React.FC = () => {
  const session = useLeaderSession();
  const { status, lastSync, error: syncError } = useSyncStatus();
  const { signIn, busy, error: signInError } = useGoogleSignIn();
  const [problem, setProblem] = useState<string | null>(null);

  const onExport = async () => {
    setProblem(null);
    const result = await exportAndDownloadAll();
    if (!result.success) setProblem(`导出失败 Export failed: ${result.error ?? ''}`);
  };
  const onSignOut = async () => {
    const { error } = await authManager.signOut();
    if (error) setProblem(error.message);
  };

  if (session.loading) return null;
  return (
    <div data-testid="sync-line" className="text-xs text-slate-600 space-y-1">
      {session.uid ? (
        <p data-testid="sync-line-signed-in">
          {signedInText(status, syncError)}
          {lastSync && <span className="text-slate-400"> · {LAST_SYNC} {new Date(lastSync).toLocaleTimeString()}</span>}
        </p>
      ) : (
        <p data-testid="sync-line-local">{SYNC_LINE_LOCAL}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {session.uid ? (
          <button type="button" className={btn} onClick={() => void onSignOut()}>{SIGN_OUT}</button>
        ) : (
          <>
            {session.configured && (
              <button type="button" data-testid="sync-line-signin" className={btn} disabled={busy} onClick={() => void signIn()}>
                {busy ? SIGNING_IN : SIGN_IN}
              </button>
            )}
            <button type="button" data-testid="sync-line-export" className={btn} onClick={() => void onExport()}>{EXPORT}</button>
          </>
        )}
      </div>
      {(problem || signInError) && <p role="alert" className="text-red-700">{problem ?? signInError}</p>}
    </div>
  );
};

export default SyncStatusLine;
