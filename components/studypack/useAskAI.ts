/**
 * useAskAI.ts — overlay Q&A state for TV presentation mode · 问AI状态
 *
 * Ephemeral, in-memory conversation. Answers stream in token-by-token via
 * askAIFallback.ts: `streamingText` holds the partial answer while it arrives,
 * then the final text moves into `messages`. `model` names the model in play
 * (requested, then the concrete id OpenRouter served). Failures land in
 * `error` with a kind the overlay maps to Retry / Set up AI buttons; `retry`
 * re-sends the last question against the same history. `configured` is
 * the shared AI gate (components/setup/useAIAccess: own key OR signed in,
 * live on auth changes); `markConfigured()` re-reads it after the inline
 * form stored a key.
 * Saved history (ADR-0021, optional): `restored` turns are put before the
 * conversation once they arrive (so they are also the follow-up history);
 * `onAnswered` gets each completed, non-empty answer; `clear()` empties the
 * view without touching what is saved.
 */
import { useState, useCallback, useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { useAIAccess } from '../setup/useAIAccess';
import { StudyPack, Slide } from './packTypes';
import { resolveAskAIModel, AskAIMessage } from './askAI';
import { streamStudyAI } from './askAIFallback';
import { AskAIErrorKind, asAskAIError } from './askAIErrors';
import type { AskExchange } from './askHistory';

export interface AskAIFailure {
  kind: AskAIErrorKind;
  message: string;
}

export interface AskAI {
  messages: AskAIMessage[];
  /** Partial answer while streaming; null when idle. */
  streamingText: string | null;
  loading: boolean;
  error: AskAIFailure | null;
  configured: boolean;
  /** Model in play: the resolved id while waiting, the served id once the stream names one. */
  model: string | null;
  /** Call after the inline form stored a key so asking becomes possible. */
  markConfigured: () => void;
  ask: (question: string) => Promise<void>;
  /** Re-send the last question (after a failure). */
  retry: () => Promise<void>;
  /** Abort any in-flight stream (called when the overlay closes). */
  cancel: () => void;
  /** Empty the conversation view (nothing saved is deleted). */
  clear: () => void;
  /** The `restored` turns are in `messages` (a first question may go now and carry them). */
  restoredIn: boolean;
}

export interface AskAIOptions {
  /** Saved turns to put before the conversation, once (null until loaded). */
  restored?: AskAIMessage[] | null;
  /** Each completed, non-empty answer with its question and model. */
  onAnswered?: (exchange: AskExchange) => void;
}

interface LastAsk {
  question: string;
  history: AskAIMessage[];
}

/** Saved turns go first, once (a question already asked stays after them); true once they are in. */
function useRestoredTurns(
  restored: AskAIMessage[] | null | undefined, setMessages: Dispatch<SetStateAction<AskAIMessage[]>>,
): boolean {
  const [restoredIn, setRestoredIn] = useState(false);
  useEffect(() => {
    if (!restored || restoredIn) return;
    setRestoredIn(true);
    setMessages(m => [...restored, ...m]);
  }, [restored, restoredIn, setMessages]);
  return restoredIn;
}

// TODO(R4): over the 50-line function budget — move `send` (the stream + its state) into its own hook.
export function useAskAI(pack: StudyPack, slide: Slide | undefined, options: AskAIOptions = {}): AskAI {
  const [messages, setMessages] = useState<AskAIMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AskAIFailure | null>(null);
  const access = useAIAccess();
  const configured = access.available;
  const [model, setModel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAskRef = useRef<LastAsk | null>(null);

  const markConfigured = access.refresh;
  const onAnsweredRef = useRef(options.onAnswered);
  onAnsweredRef.current = options.onAnswered;

  const restoredIn = useRestoredTurns(options.restored, setMessages);

  // Explicit cancel (overlay Escape/✕). NOT an unmount-cleanup effect:
  // StrictMode's simulated remount would abort the auto-sent stream and
  // leave the overlay stuck on "Thinking…". If the whole tree unmounts
  // without close, the orphaned fetch finishes harmlessly in the background.
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(async (question: string, history: AskAIMessage[]) => {
    if (!slide) return;
    lastAskRef.current = { question, history };
    setMessages([...history, { role: 'user', content: question }]);
    setLoading(true);
    setError(null);
    const requested = resolveAskAIModel();
    setModel(requested);
    const controller = new AbortController();
    abortRef.current = controller;
    const live = () => !controller.signal.aborted;
    try {
      const result = await streamStudyAI(
        pack, slide, history, question,
        text => { if (live()) setStreamingText(text); },
        controller.signal,
        id => { if (live()) setModel(id); }
      );
      if (!live()) return;
      setModel(result.model);
      setMessages(m => [...m, { role: 'assistant', content: result.text }]);
      if (result.text) onAnsweredRef.current?.({ question, answer: result.text, model: result.model });
    } catch (err) {
      // Surfaced in the overlay via the returned `error` — never swallowed.
      if (!live()) return;
      const failure = asAskAIError(err, requested);
      setError({ kind: failure.kind, message: failure.message });
    } finally {
      if (live()) {
        setStreamingText(null);
        setLoading(false);
      }
    }
  }, [pack, slide]);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading || !configured) return;
    await send(trimmed, messages);
  }, [send, messages, loading, configured]);

  const retry = useCallback(async () => {
    const last = lastAskRef.current;
    if (!last || loading) return;
    await send(last.question, last.history);
  }, [send, loading]);

  const clear = useCallback(() => {
    if (loading) return;
    setMessages([]);
    setError(null);
    lastAskRef.current = null;
  }, [loading]);

  return { messages, streamingText, loading, error, configured, model, markConfigured, ask, retry, cancel, clear, restoredIn };
}
