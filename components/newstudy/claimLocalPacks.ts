/**
 * claimLocalPacks.ts — a sign-in claims this browser's ownerless packs · 登录认领
 *
 * Local packs exist only in this browser's IndexedDB, so whoever signs in
 * here is their leader. When a session appears, every local pack without a
 * leaderId is stamped with the uid (stampLeader, the same seam the editor's
 * save uses) and its pack_summaries row is synced. Idempotent: a second run
 * finds nothing to claim. One subscription (installClaimOnSignIn, mounted
 * once by LandingGate); pages that show a pack listen for the claim event
 * (useLocalPackClaim) and re-read it, so the QR appears without a reload.
 * Failures are carried on the event and rendered by those pages (R5).
 * Once the claim settles, the pack sync merges this browser with the
 * leader's account (packSync.syncPacksOnSignIn, ADR-0006) — claim first, so
 * the just-claimed packs are pushed; a sign-out drops pending pushes.
 */
import { useEffect, useState } from 'react';
import { authManager } from '../../services/supabase';
import { listLocalPacks, saveLocalPack } from '../studypack/packSource';
import { syncPackSummary } from '../signup/packSummary';
import { SU_CLAIM_FAILED } from '../signup/signupStrings';
import { stampLeader } from './packAssembly';
import { syncPacksOnSignIn, resetPackSync } from './packSync';

export const LOCAL_PACKS_CLAIMED_EVENT = 'local-packs-claimed';

export interface ClaimResult {
  /** Ids stamped in this run. */
  claimed: string[];
  /** Bilingual failure lines (storage error, or a summary sync that failed); empty when everything went through. */
  failures: string[];
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Stamp every leaderless local pack with `uid` and sync its summary. Throws only when the store itself fails. */
export async function claimLocalPacks(uid: string): Promise<ClaimResult> {
  const result: ClaimResult = { claimed: [], failures: [] };
  const { packs } = await listLocalPacks();
  for (const pack of packs) {
    if (pack.leaderId) continue;
    const stamped = stampLeader(pack, uid);
    await saveLocalPack(stamped);
    result.claimed.push(pack.id);
    const sync = await syncPackSummary(stamped);
    if (sync.status === 'failed') result.failures.push(`${pack.id}: ${sync.message}`);
  }
  return result;
}

function announce(result: ClaimResult): void {
  window.dispatchEvent(new CustomEvent<ClaimResult>(LOCAL_PACKS_CLAIMED_EVENT, { detail: result }));
}

/**
 * Run the claim once per signed-in uid, as soon as the session is known.
 * Returns the unsubscribe. A storage failure becomes a failure line on the
 * event (nothing is swallowed); the uid is not retried until the next sign-in.
 */
export function installClaimOnSignIn(): () => void {
  let claimedFor: string | null = null;
  return authManager.subscribe(state => {
    const uid = state.user?.id ?? null;
    if (!uid || uid === claimedFor) {
      if (!uid) { claimedFor = null; resetPackSync(); }
      return;
    }
    claimedFor = uid;
    claimLocalPacks(uid)
      .then(announce)
      .catch((err: unknown) => announce({ claimed: [], failures: [`${SU_CLAIM_FAILED}: ${describe(err)}`] }))
      // syncPacksOnSignIn never rejects: its failures land on the PackSyncLine status.
      .then(() => syncPacksOnSignIn());
  });
}

export interface LocalPackClaim {
  /** Increments each time this pack is claimed; callers re-read the pack on change. */
  version: number;
  /** The latest claim failure line, if any. */
  failure: string | null;
}

/** Subscribe a page to the claim event for one pack. */
export function useLocalPackClaim(packId: string): LocalPackClaim {
  const [state, setState] = useState<LocalPackClaim>({ version: 0, failure: null });
  useEffect(() => {
    const onClaimed = (event: Event) => {
      const result = (event as CustomEvent<ClaimResult>).detail;
      setState(current => ({
        version: result.claimed.includes(packId) ? current.version + 1 : current.version,
        failure: result.failures.length ? `${SU_CLAIM_FAILED}: ${result.failures.join('; ')}` : null,
      }));
    };
    window.addEventListener(LOCAL_PACKS_CLAIMED_EVENT, onClaimed);
    return () => window.removeEventListener(LOCAL_PACKS_CLAIMED_EVENT, onClaimed);
  }, [packId]);
  return state;
}
