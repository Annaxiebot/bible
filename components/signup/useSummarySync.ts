/**
 * useSummarySync.ts — keep pack_summaries fresh while an owner is looking · 摘要同步
 *
 * Runs syncPackSummary once per pack id + owner (the leader page, the QR on
 * the TV slide and the landing panel all mount this). Returns the result so
 * the caller renders a failure line; nothing is swallowed.
 */
import { useEffect, useRef, useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';
import { syncPackSummary, SummarySync } from './packSummary';

export function useSummarySync(pack: StudyPack | null): SummarySync {
  const [state, setState] = useState<SummarySync>({ status: 'skipped' });
  // The latest pack object, read inside the effect; the effect itself re-runs only when id/owner change.
  const latest = useRef(pack);
  latest.current = pack;
  const packId = pack?.id;
  const leaderId = pack?.leaderId;
  useEffect(() => {
    const current = latest.current;
    if (!current || !leaderId) return;
    let cancelled = false;
    syncPackSummary(current).then(result => { if (!cancelled) setState(result); });
    return () => { cancelled = true; };
  }, [packId, leaderId]);
  return state;
}
