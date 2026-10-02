/**
 * useAskAI.ts — overlay Q&A state for TV presentation mode · 问AI状态
 *
 * Ephemeral, in-memory conversation. Answers stream in token-by-token via
 * askAIFallback.ts: `streamingText` holds the partial answer while it arrives,
 * then the final text moves into `messages`. `model` names the model in play
 * (requested, then the concrete id OpenRouter served). Failures land in
 * `error` with a kind the overlay maps to Retry / Set up AI buttons; `retry`
 * re-sends the last question against the same history. `configured` is
 * read once on mount and flipped by `markConfigured()` after the inline key
 * setup saves.
 */
import { useState, useCallback, useRef } from 'react';
import { StudyPack, Slide } from './packTypes';
import { isAskAIConfigured, resolveAskAIModel, AskAIMessage } from './askAI';
import { streamStudyAI } from './askAIFallback';
import { AskAIErrorKind, asAskAIError } from './askAIErrors';

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
  /** Call after a key has been stored (inline setup) so asking becomes possible. */
  markConfigured: () => void;
  ask: (question: string) => Promise<void>;
  /** Re-send the last question (after a failure). */
  retry: () => Promise<void>;
  /** Abort any in-flight stream (called when the overlay closes). */
  cancel: () => void;
}

interface LastAsk {
  question: string;
  history: AskAIMessage[];
}

export function useAskAI(pack: StudyPack, slide: Slide | undefined): AskAI {
  const [messages, setMessages] = useState<AskAIMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AskAIFailure | null>(null);
  const [configured, setConfigured] = useState(isAskAIConfigured);
  const [model, setModel] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastAskRef = useRef<LastAsk | null>(null);

  const markConfigured = useCallback(() => setConfigured(isAskAIConfigured()), []);

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

  return { messages, streamingText, loading, error, configured, model, markConfigured, ask, retry, cancel };
}
