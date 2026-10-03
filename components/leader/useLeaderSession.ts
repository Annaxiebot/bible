/**
 * useLeaderSession.ts — who the signed-in leader is, for the UI · 带领者会话
 *
 * One hook behind the landing nav's leader control and the leader home
 * (#/leader): Supabase configured?, still loading?, the uid, email and a
 * short display name. Reads the app's session (services/supabase
 * authManager).
 *
 * E2E seam (dev builds only, same pattern as window.__SUPABASE_E2E__ in
 * signupClient): window.__LEADER_E2E__ = { uid, email, name } stands in for
 * a Google session so Playwright can render the signed-in pages; data calls
 * still go through getSignupClient's routed fake base. Ignored in
 * production builds (import.meta.env.DEV is false).
 */
import { useEffect, useState } from 'react';
import { authManager, isSupabaseConfigured, type AuthState } from '../../services/supabase';

export interface LeaderSession {
  configured: boolean;
  loading: boolean;
  uid: string | null;
  email: string | null;
  name: string | null;
}

interface E2ELeader { uid: string; email: string | null; name: string | null }

function e2eLeader(): E2ELeader | null {
  if (!import.meta.env.DEV) return null;
  const value = (window as Window & { __LEADER_E2E__?: unknown }).__LEADER_E2E__;
  if (typeof value !== 'object' || value === null) return null;
  const { uid, email, name } = value as Partial<E2ELeader>;
  return typeof uid === 'string' ? { uid, email: email ?? null, name: name ?? null } : null;
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
