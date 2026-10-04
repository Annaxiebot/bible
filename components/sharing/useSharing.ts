/**
 * useSharing.ts — the editor control's state · 上周分享控件状态
 *
 * Lists the leader's other packs (this browser's store, which the sign-in
 * merge fills from the account, ADR-0006) as previous-pack candidates with
 * sharingData's default chosen; `prepare()` runs prepareSharing and hands
 * the pack — the LATEST one, not the one at click time — with the section
 * after the title to `onApply` (the editor's edit → auto-save). Status is
 * one typed value the control renders; a cancel on unmount is silent.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { listLocalPacks } from '../studypack/packSource';
import { hostedUid } from '../../services/aiTransport';
import { getSignupClient } from '../signup/signupClient';
import { NS_ERR_STORAGE } from '../newstudy/newStudyStrings';
import { previousPackCandidates, defaultPreviousPack } from './sharingData';
import { prepareSharing } from './prepareSharing';
import { withSharingSection } from './sharingSection';
import { SharingError } from './sharingReply';
import { SH_SIGN_IN, SH_ERR_UNCONFIGURED } from './sharingStrings';

export type SharingStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'drafting' }
  | { kind: 'done'; aiUsed: boolean }
  | { kind: 'failed'; message: string };

export interface SharingControlState {
  uid: string | null;
  candidates: StudyPack[] | null;   // null while listing
  previousId: string;
  setPreviousId: (id: string) => void;
  status: SharingStatus;
  prepare: () => Promise<void>;
}

function useCandidates(pack: StudyPack, uid: string | null, onError: (message: string) => void) {
  const [candidates, setCandidates] = useState<StudyPack[] | null>(null);
  const [previousId, setPreviousId] = useState('');
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    listLocalPacks()
      .then(list => {
        if (cancelled) return;
        const found = previousPackCandidates(list.packs, pack, uid);
        setCandidates(found);
        setPreviousId(id => id || (defaultPreviousPack(found, pack)?.id ?? ''));
      })
      .catch((err: unknown) => { if (!cancelled) onError(`${NS_ERR_STORAGE}: ${(err as Error).message}`); });
    return () => { cancelled = true; };
    // Listed once per pack id and leader; edits to the current pack do not change the candidates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id, uid]);
  return { candidates, previousId, setPreviousId };
}

export function useSharing(pack: StudyPack, onApply: (pack: StudyPack) => void): SharingControlState {
  const uid = hostedUid();
  const [status, setStatus] = useState<SharingStatus>({ kind: 'idle' });
  const fail = useCallback((message: string) => setStatus({ kind: 'failed', message }), []);
  const { candidates, previousId, setPreviousId } = useCandidates(pack, uid, fail);
  const latest = useRef(pack);
  latest.current = pack;
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const prepare = useCallback(async () => {
    const previous = candidates?.find(p => p.id === previousId);
    const client = getSignupClient();
    if (!uid) return fail(SH_SIGN_IN);
    if (!client) return fail(SH_ERR_UNCONFIGURED);
    if (!previous) return;
    const controller = new AbortController();
    abort.current = controller;
    setStatus({ kind: 'loading' });
    try {
      const result = await prepareSharing({
        client, uid, current: latest.current, previous, signal: controller.signal,
        onDrafting: () => setStatus({ kind: 'drafting' }),
      });
      onApply(withSharingSection(latest.current, result.section));
      setStatus({ kind: 'done', aiUsed: result.aiUsed });
    } catch (err) {
      // A cancel (unmount) is not a failure; everything else is shown.
      if ((err as Error).name === 'AbortError') return;
      fail(err instanceof SharingError ? err.message : `${(err as Error).message}`);
    }
  }, [candidates, previousId, uid, fail, onApply]);

  return { uid, candidates, previousId, setPreviousId, status, prepare };
}
