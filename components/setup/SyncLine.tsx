/**
 * SyncLine.tsx — the one line under "模型 Models" about syncing · 同步设置行
 *
 * Signed out: "登录以在各设备同步设置 Sign in to sync settings across devices"
 * + the Google button (useGoogleSignIn, identity-only) when Supabase is
 * configured. Signed in: "已登录 Signed in · 设置已同步 settings synced",
 * the email, a sign-out link; a failed pull/push, or a failed sign-out,
 * shows as a red line with the server message (never swallowed, R5). Same senior type
 * floors as the dialog (ADR-0003 §15).
 */
import React, { useEffect, useState } from 'react';
import { authManager, isSupabaseConfigured, type AuthState } from '../../services/supabase';
import { subscribeLeaderSyncStatus, type LeaderSyncStatus } from '../../services/leaderSettings';
import { useGoogleSignIn } from '../signup/useGoogleSignIn';
import { SU_SIGN_IN_GOOGLE, SU_SIGNING_IN } from '../signup/signupStrings';
import {
  SETUP_SYNC_SIGNED_OUT, SETUP_SYNC_SIGNED_IN, SETUP_SIGN_OUT, SETUP_SYNC_FAILED, SETUP_SIGN_OUT_FAILED,
} from './setupStrings';

export interface SyncLineProps {
  textStyle: React.CSSProperties;
  controlStyle: React.CSSProperties;
}

const linkClass = 'self-start text-amber-300 underline underline-offset-4';

const SignedOut: React.FC<SyncLineProps> = ({ textStyle, controlStyle }) => {
  const { signIn, busy, error } = useGoogleSignIn();
  return (
    <>
      <p className="text-slate-300" style={textStyle}>{SETUP_SYNC_SIGNED_OUT}</p>
      {isSupabaseConfigured() && (
        <button type="button" onClick={() => void signIn()} disabled={busy}
          className="self-start rounded-lg bg-amber-500 px-5 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
          style={controlStyle}>
          {busy ? SU_SIGNING_IN : SU_SIGN_IN_GOOGLE}
        </button>
      )}
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
    </>
  );
};

const SignedIn: React.FC<SyncLineProps & { email: string | null }> = ({ textStyle, controlStyle, email }) => {
  const [status, setStatus] = useState<LeaderSyncStatus>({ state: 'idle', failure: null });
  const [signOutError, setSignOutError] = useState<string | null>(null);
  useEffect(() => subscribeLeaderSyncStatus(setStatus), []);
  const signOut = async () => {
    const { error } = await authManager.signOut();
    setSignOutError(error ? error.message : null);
  };
  return (
    <>
      <p data-testid="sync-signed-in" className="text-emerald-300" style={textStyle}>
        {SETUP_SYNC_SIGNED_IN}{email ? ` · ${email}` : ''}
      </p>
      {status.failure && (
        <p role="alert" className="text-red-300" style={textStyle}>
          {SETUP_SYNC_FAILED} · {status.failure.message}
        </p>
      )}
      {signOutError && (
        <p role="alert" className="text-red-300" style={textStyle}>{SETUP_SIGN_OUT_FAILED} · {signOutError}</p>
      )}
      <button type="button" onClick={() => void signOut()} className={linkClass} style={controlStyle}>
        {SETUP_SIGN_OUT}
      </button>
    </>
  );
};

export const SyncLine: React.FC<SyncLineProps> = (props) => {
  const [auth, setAuth] = useState<AuthState>(authManager.getState());
  useEffect(() => authManager.subscribe(setAuth), []);
  return (
    <div data-testid="sync-line" className="flex flex-col gap-2 border-t border-slate-700 pt-3">
      {auth.isAuthenticated
        ? <SignedIn {...props} email={auth.user?.email ?? null} />
        : <SignedOut {...props} />}
    </div>
  );
};
