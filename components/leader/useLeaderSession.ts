/**
 * useLeaderSession.ts — who the signed-in leader is, for the UI · 带领者会话
 *
 * One hook behind the landing nav's leader control and the leader home
 * (#/leader): Supabase configured?, still loading?, the uid, email and a
 * short display name. Reads the app's session (services/supabase
 * authManager).
 *
 * E2E seam: services/e2eLeader.ts (dev builds only) stands in for a Google
 * session; data calls still go through getSignupClient's routed fake base.
 */
import { useEffect, useState } from 'react';
import { authManager, isSupabaseConfigured, type AuthState } from '../../services/supabase';
import { e2eLeader } from '../../services/e2eLeader';

export interface LeaderSession {
  configured: boolean;
  loading: boolean;
  uid: string | null;
  email: string | null;
  name: string | null;
}


/** First word of the full name; else the email's local part; else ''. */
export function leaderDisplayName(name: string | null, email: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  if (first) return first;
  return email?.split('@')[0] ?? '';
}

export function useLeaderSession(): LeaderSession {
  const [auth, setAuth] = useState<AuthState>(authManager.getState());
  useEffect(() => authManager.subscribe(setAuth), []);
  const fake = e2eLeader();
  if (fake) return { configured: true, loading: false, ...fake };
  const signedIn = auth.isAuthenticated && !!auth.user;
  return {
    configured: isSupabaseConfigured(),
    loading: auth.isLoading,
    uid: signedIn ? auth.user!.id : null,
    email: signedIn ? auth.user!.email ?? null : null,
    name: signedIn ? authManager.getFullName() : null,
  };
}
