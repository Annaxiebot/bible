/**
 * useLeaderAskHistory.ts — the study's saved Ask AI exchanges for #/leader/<id> · 问一问记录 (ADR-0021)
 *
 * Loads the saved exchanges (newest first for the list) and the study's
 * "Replace oldest" permission; deletes one or all; turns the permission
 * off. Every failure is kept as `error` for an inline alert (R5); a failed
 * delete keeps the row on screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { getSignupClient } from '../signup/signupClient';
import {
  SavedExchange, listAskHistory, deleteAskExchange, deleteAllAskHistory, fetchReplaceOldest, setReplaceOldest,
} from '../studypack/askHistory';

export interface LeaderAskHistory {
  /** Newest first; null while loading. */
  rows: SavedExchange[] | null;
  replaceOldest: boolean;
  error: string | null;
  remove: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
  stopReplacing: () => Promise<void>;
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function useLeaderAskHistory(packId: string, uid: string): LeaderAskHistory {
  const [rows, setRows] = useState<SavedExchange[] | null>(null);
  const [replaceOldest, setReplace] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const client = getSignupClient();
    if (!client) return;
    let cancelled = false;
    Promise.all([listAskHistory(client, packId, uid), fetchReplaceOldest(client, packId, uid)])
      .then(([list, allowed]) => {
        if (cancelled) return;
        setRows([...list].reverse());
        setReplace(allowed);
      })
      .catch((err: unknown) => { if (!cancelled) { setRows([]); setError(describe(err)); } });
    return () => { cancelled = true; };
  }, [packId, uid]);

  /** Run one write; on success apply `after`, on failure keep the screen as it is and say why. */
  const run = useCallback(async (write: (client: NonNullable<ReturnType<typeof getSignupClient>>) => Promise<void>, after: () => void) => {
    const client = getSignupClient();
    if (!client) return;
    try {
      await write(client);
      after();
      setError(null);
    } catch (err) {
      setError(describe(err));
    }
  }, []);

  const remove = useCallback((id: string) => run(
    client => deleteAskExchange(client, id, uid),
    () => setRows(r => (r ?? []).filter(x => x.id !== id)),
  ), [run, uid]);
  const removeAll = useCallback(() => run(client => deleteAllAskHistory(client, packId, uid), () => setRows([])), [run, packId, uid]);
  const stopReplacing = useCallback(() => run(client => setReplaceOldest(client, packId, uid, false), () => setReplace(false)), [run, packId, uid]);

  return { rows, replaceOldest, error, remove, removeAll, stopReplacing };
}
