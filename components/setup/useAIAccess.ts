/**
 * useAIAccess.ts — can this visitor use AI right now? · AI可用状态
 *
 * The one gate (ADR-0007) behind the New-study page, the TV Ask-AI overlay
 * and the AI status form: a signed-in leader (hosted AI, services/
 * aiTransport) → AI is available; signed out → the form shows the sign-in
 * choices. One rule since 2026-10-23: sign in to use AI (no own key).
 * Re-renders on every auth change (sign-in completes asynchronously after a
 * redirect or an emailed code).
 */
import { useState, useEffect } from 'react';
import { authManager, type AuthState } from '../../services/supabase';
import { hostedUid } from '../../services/aiTransport';

export interface AIAccess {
  /** The signed-in leader's uid (hosted AI); null when signed out. */
  uid: string | null;
  /** Signed in. */
  available: boolean;
}

export function useAIAccess(): AIAccess {
  const [auth, setAuth] = useState<AuthState>(authManager.getState());
  useEffect(() => authManager.subscribe(setAuth), []);
  const uid = hostedUid(auth);
  return { uid, available: uid !== null };
}
