/**
 * sessionUid.ts — "who is signed in, if anyone" for the sync modules · 当前登录用户
 *
 * One definition (R3) shared by leaderSettings (ADR-0005) and packSync
 * (ADR-0006): the uid when Supabase is configured and a session exists;
 * null otherwise, which every caller treats as "do nothing".
 */
import { supabase, authManager } from './supabase';

export function signedInUid(): string | null {
  if (!supabase) return null;
  return authManager.getState().isAuthenticated ? authManager.getUserId() : null;
}
