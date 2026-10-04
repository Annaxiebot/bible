/**
 * useSignupPack.ts — load a pack the way the sign-up page sees it · 载入报名页的查经包
 *
 * One hook for #/signup and the leader's #/qr page: signupPack.loadSignupPack
 * (works signed in or out), loaded again after a sign-in claims the pack. A
 * failure is a rendered state carrying the message, never a silent catch.
 */
import { useEffect, useState } from 'react';
import { loadSignupPack, SignupPack } from './signupPack';
import { useLocalPackClaim } from '../newstudy/claimLocalPacks';

export type SignupPackState =
  | { status: 'loading' }
  | { status: 'ready'; pack: SignupPack }
  | { status: 'failed'; message: string };

export function useSignupPack(packId: string): SignupPackState {
  const [state, setState] = useState<SignupPackState>({ status: 'loading' });
  const claim = useLocalPackClaim(packId);
  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadSignupPack(packId)
      .then(pack => { if (!cancelled) setState({ status: 'ready', pack }); })
      .catch((err: unknown) => {
        // Surfaced: the 'failed' state renders SU_ERR_PACK with the message.
        if (!cancelled) setState({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { cancelled = true; };
  }, [packId, claim.version]);
  return state;
}
