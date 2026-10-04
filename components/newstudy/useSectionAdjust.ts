/**
 * useSectionAdjust.ts — state of one section's "AI 修改 Adjust with AI" · 单段修改状态
 *
 * send(instruction) → busy → the adjusted content goes through the editor's
 * normal onPatch (so auto-save persists it) and one level of undo is kept.
 * Undo stays offered only while the section still holds exactly what the AI
 * wrote: any later edit of that section drops it. onPatch is read through a
 * ref at completion time — the parent's closure from when Send was pressed
 * would hold a stale pack and lose edits made to other sections meanwhile.
 * Unmount aborts the request.
 */
import { useEffect, useRef, useState } from 'react';
import { PackSection, packContentLanguage } from '../studypack/packTypes';
import { adjustContent, AdjustPack } from './adjustPrompt';
import { adjustSection } from './adjustSection';

interface Undo { previous: Partial<PackSection>; applied: string }

export interface SectionAdjustState {
  busy: boolean;
  error: string | null;
  canUndo: boolean;
  send: (instruction: string) => Promise<boolean>;
  undo: () => void;
}

function contentKey(section: PackSection): string {
  return JSON.stringify(adjustContent(section));
}

export function useSectionAdjust(
  section: PackSection,
  pack: AdjustPack,
  onPatch: (patch: Partial<PackSection>) => void
): SectionAdjustState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<Undo | null>(null);
  const latest = useRef({ section, onPatch });
  latest.current = { section, onPatch };
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const send = async (instruction: string): Promise<boolean> => {
    const before = latest.current.section;
    const ctrl = new AbortController();
    controller.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      const input = { passageRef: pack.passageRef, contentLanguage: packContentLanguage(pack), section: before, instruction };
      const next = await adjustSection(input, ctrl.signal);
      const patch = adjustContent(next);
      setUndoState({ previous: adjustContent(before), applied: contentKey(next) });
      latest.current.onPatch(patch);
      return true;
    } catch (err) {
      // A cancel (unmount) is not a failure; everything else is shown in the box.
      if ((err as Error).name !== 'AbortError') setError((err as Error).message);
      return false;
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  const canUndo = undoState !== null && contentKey(section) === undoState.applied;
  const undo = () => {
    if (!undoState) return;
    setUndoState(null);
    latest.current.onPatch(undoState.previous);
  };
  return { busy, error, canUndo, send, undo };
}
