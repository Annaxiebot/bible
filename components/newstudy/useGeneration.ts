/**
 * useGeneration.ts — run/cancel one pack generation, driving the page phase · 生成状态
 *
 * generate(): form → generating (progress updates) → editor | failed.
 * cancel(): aborts; the pipeline's AbortError returns the page to the form
 * (the leader's own choice, not a failure).
 */
import { useRef, useCallback } from 'react';
import { generateStudyPack } from './generatePack';
import { StudyRequest } from './packAssembly';
import { Phase } from './PhaseView';

export interface Generation {
  generate: (req: StudyRequest) => Promise<void>;
  cancel: () => void;
}

export function useGeneration(setPhase: (phase: Phase) => void): Generation {
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (req: StudyRequest) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'generating', req, step: '', detail: '' });
    try {
      const pack = await generateStudyPack(
        req,
        (step, detail = '') => setPhase({ kind: 'generating', req, step, detail }),
        controller.signal
      );
      setPhase({ kind: 'editor', pack });
    } catch (err) {
      // A cancel (Cancel button) is the leader's own choice: back to the form, no error.
      // A study guide stays loaded, so Cancel does not make the leader pick the PDF again.
      if ((err as Error).name === 'AbortError') { setPhase(req.guide ? { kind: 'form', guide: req.guide } : { kind: 'form' }); return; }
      setPhase({ kind: 'failed', req, message: (err as Error).message });
    }
  }, [setPhase]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  return { generate, cancel };
}
