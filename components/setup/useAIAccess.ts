/**
 * useAIAccess.ts — can this visitor use AI right now? · AI可用状态
 *
 * The one gate (ADR-0007) behind the New-study page, the TV Ask-AI overlay
 * and the AI status form: an own OpenRouter key OR a signed-in leader
 * (hosted AI, services/aiTransport) → AI is available; neither → the form
 * shows the sign-in prompt with the own-key option below it. Re-renders on
 * every auth change (sign-in completes asynchronously after a redirect);
 * `refresh()` re-reads the stored key after the form saved one.
 */
import { useState, useEffect, useCallback } from 'react';
import { authManager, type AuthState } from '../../services/supabase';
import { hasOwnKey, hostedUid } from '../../services/aiTransport';

export interface AIAccess {
  /** An OpenRouter key is stored in this browser (the direct path wins). */
  ownKey: boolean;
  /** The signed-in leader's uid (hosted AI); null when signed out. */
  uid: string | null;
  /** ownKey || signed in. */
  available: boolean;
  refresh: () => void;
}

export function useAIAccess(): AIAccess {
  const [auth, setAuth] = useState<AuthState>(authManager.getState());
  const [ownKey, setOwnKey] = useState(hasOwnKey);
  useEffect(() => authManager.subscribe(setAuth), []);
  const refresh = useCallback(() => setOwnKey(hasOwnKey()), []);
  const uid = hostedUid(auth);
  return { ownKey, uid, available: ownKey || uid !== null, refresh };
}
