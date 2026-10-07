/**
 * LeaderSignOut.tsx — "退出登录 Sign out" on the leader home · 退出登录
 *
 * Shows who is signed in and a sign-out button; a failed sign-out is shown
 * with the auth message (never swallowed, R5). Strings are the setup page's
 * sign-out strings (one source, R3).
 */
import React, { useState } from 'react';
import { authManager } from '../../services/supabase';
import { SETUP_SIGN_OUT, SETUP_SIGN_OUT_FAILED, SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../setup/setupStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };

export const LeaderSignOut: React.FC<{ email: string | null }> = ({ email }) => {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signOut = async () => {
    setBusy(true);
    const { error: failure } = await authManager.signOut();
    setBusy(false);
    setError(failure ? failure.message : null);
  };
  return (
    <div data-testid="leader-sign-out" className="flex flex-wrap items-center gap-x-2 text-stl-text-2" style={textStyle}>
      {email && <span>{email}</span>}
      {email && <span aria-hidden="true">·</span>}
      <button type="button" onClick={() => void signOut()} disabled={busy}
        className="underline underline-offset-4 hover:text-stl-text disabled:opacity-60" style={controlStyle}>
        {SETUP_SIGN_OUT}
      </button>
      {error && <p role="alert" className="w-full text-red-300" style={textStyle}>{SETUP_SIGN_OUT_FAILED} · {error}</p>}
    </div>
  );
};
