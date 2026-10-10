/**
 * useAskHistory.ts — the TV Ask AI's saved conversation for an owned study · 问一问记录 (ADR-0021)
 *
 * Owned = a signed-in leader (useLeaderSession) whose uid is the pack's
 * leaderId, with a Supabase client. Then, on open, the study's saved
 * exchanges load (oldest first) as `restored`; each completed answer is
 * saved; at the limit the exchange waits in `pending` for the leader's
 * "Replace oldest" / "Don't save". Not owned (demo pack, signed out,
 * someone else's pack): nothing loads, nothing saves — today's in-memory
 * panel. Saving runs in the background and never blocks or breaks the
 * answer; any failure becomes `problem`, one quiet line in the panel (R5).
 */
import { useCallback, useEffect, useState } from 'react';
import type { StudyPack } from './packTypes';
import type { AskAIMessage } from './askAI';
import { getSignupClient } from '../signup/signupClient';
import { useLeaderSession } from '../leader/useLeaderSession';
import { AskExchange, listAskHistory, saveAskExchange, exchangesToMessages } from './askHistory';

export interface AskHistory {
  owned: boolean;
  /** Restore finished (or nothing to restore): the panel may auto-send its first question. */
  ready: boolean;
  /** The saved exchanges as turns, once loaded; null until then (and when not owned). */
  restored: AskAIMessage[] | null;
  /** An answer that met the full study, waiting for the leader's choice. */
  pending: AskExchange | null;
  /** The last failure, as one line; null when all is well. */
  problem: string | null;
  save: (ex: AskExchange) => void;
  replaceOldest: () => void;
  dontSave: () => void;
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Load once per (owned study, leader); failures become the problem line. */
function useRestore(owned: boolean, packId: string, uid: string | null, setProblem: (p: string | null) => void) {
  const [restored, setRestored] = useState<AskAIMessage[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const client = getSignupClient();
    if (!owned || !uid || !client) return;
    let cancelled = false;
    listAskHistory(client, packId, uid)
      .then(rows => { if (!cancelled) setRestored(exchangesToMessages(rows)); })
      .catch((err: unknown) => { if (!cancelled) setProblem(describe(err)); })
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [owned, packId, uid, setProblem]);
  return { restored, loaded };
}

export function useAskHistory(pack: StudyPack): AskHistory {
  const session = useLeaderSession();
  const owned = !!session.uid && pack.leaderId === session.uid && getSignupClient() !== null;
  const [pending, setPending] = useState<AskExchange | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const { restored, loaded } = useRestore(owned, pack.id, session.uid, setProblem);

  const write = useCallback((ex: AskExchange, replace: boolean) => {
    const client = getSignupClient();
    if (!owned || !client) return;
    saveAskExchange(client, pack.id, ex, replace)
      .then(outcome => {
        setProblem(null);
        if (outcome === 'full') setPending(ex);
      })
      .catch((err: unknown) => setProblem(describe(err)));
  }, [owned, pack.id]);

  const save = useCallback((ex: AskExchange) => write(ex, false), [write]);
  const replaceOldest = useCallback(() => {
    if (pending) write(pending, true);
    setPending(null);
  }, [pending, write]);
  const dontSave = useCallback(() => setPending(null), []);

  // A demo pack never waits; a leader pack waits for the session, then (when owned) for the restore.
  const ready = !pack.leaderId || (!session.loading && (!owned || loaded));
  return { owned, ready, restored, pending, problem, save, replaceOldest, dontSave };
}
