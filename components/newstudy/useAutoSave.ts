/**
 * useAutoSave.ts — a pack is never lost · 自动保存
 *
 * Persists the editor's pack through the caller's save function: the first
 * time a pack is seen (generation just finished, or a range change produced
 * a new pack id) it is saved at once; every later edit is saved after a
 * short quiet period (AUTOSAVE_DELAY_MS). A pack opened from "My packs" is
 * marked clean first so opening it does not re-save it. `flush` saves any
 * pending edit now (Preview, the explicit Save button, Back); an unmount
 * with a pending edit also flushes. Failures land in `error` (R5).
 *
 * Scar: a leader generated a pack, pressed Preview, closed TV mode and the
 * pack was gone — nothing had persisted it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyPack } from '../studypack/packTypes';

export const AUTOSAVE_DELAY_MS = 500;

export type AutoSaveStatus = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

export interface AutoSave {
  status: AutoSaveStatus;
  error: string | null;
  /** Save a pending edit now; resolves once stored (rejects with the save error). No-op when clean. */
  flush: () => Promise<void>;
  /** Treat this pack as already stored (opened from the list / reloaded from IndexedDB). */
  markClean: (pack: StudyPack) => void;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function useAutoSave(
  pack: StudyPack | null,
  save: (pack: StudyPack) => Promise<void>,
  delayMs: number = AUTOSAVE_DELAY_MS,
): AutoSave {
  const savedRef = useRef<StudyPack | null>(null);   // last pack object persisted or marked clean
  const pendingRef = useRef<StudyPack | null>(null); // edit waiting for the quiet period
  const [status, setStatus] = useState<AutoSaveStatus>('clean');
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (next: StudyPack) => {
    pendingRef.current = null;
    setStatus('saving');
    try {
      await save(next);
    } catch (err) {
      setError(describe(err));
      setStatus('error');
      throw err;
    }
    savedRef.current = next;
    setError(null);
    setStatus('saved');
  }, [save]);

  useEffect(() => {
    if (!pack || pack === savedRef.current) return;
    const firstSight = savedRef.current === null || savedRef.current.id !== pack.id;
    if (firstSight) {
      // Surfaced through `error`/status; the rejection is consumed here on purpose.
      void persist(pack).catch(() => undefined);
      return;
    }
    pendingRef.current = pack;
    setStatus('dirty');
    const timer = window.setTimeout(() => { void persist(pack).catch(() => undefined); }, delayMs);
    return () => window.clearTimeout(timer);
  }, [pack, persist, delayMs]);

  // Leaving the editor with an edit still in the quiet period: save it anyway.
  // Nothing is mounted to show a failure, so a rejection stays unhandled (visible, not swallowed).
  useEffect(() => () => { if (pendingRef.current) void save(pendingRef.current); }, [save]);

  const flush = useCallback(async () => {
    if (pack && pack !== savedRef.current) await persist(pack);
  }, [pack, persist]);

  const markClean = useCallback((clean: StudyPack) => {
    savedRef.current = clean;
    pendingRef.current = null;
    setStatus('clean');
  }, []);

  return { status, error, flush, markClean };
}
