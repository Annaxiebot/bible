/**
 * useAskAI.ts — overlay Q&A state for TV presentation mode · 问AI状态
 *
 * Ephemeral, in-memory conversation. Answers stream in token-by-token via
 * askAIStream.ts: `streamingText` holds the partial answer while it arrives,
 * then the final text moves into `messages`. Unmounting (overlay closed)
 * aborts any in-flight stream cleanly.
 */
import { useState, useCallback, useRef } from 'react';
import { StudyPack, Slide } from './packTypes';
import { isAskAIConfigured, AskAIMessage } from './askAI';
import { streamStudyAI } from './askAIStream';

export interface AskAI {
  messages: AskAIMessage[];
  /** Partial answer while streaming; null when idle. */
  streamingText: string | null;
  loading: boolean;
  error: string | null;
  configured: boolean;
  ask: (question: string) => Promise<void>;
  /** Abort any in-flight stream (called when the overlay closes). */
  cancel: () => void;
}

export function useAskAI(pack: StudyPack, slide: Slide | undefined): AskAI {
  const [messages, setMessages] = useState<AskAIMessage[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured] = useState(isAskAIConfigured);
  const abortRef = useRef<AbortController | null>(null);

  // Explicit cancel (overlay Escape/✕). NOT an unmount-cleanup effect:
  // StrictMode's simulated remount would abort the auto-sent stream and
  // leave the overlay stuck on "Thinking…". If the whole tree unmounts
  // without close, the orphaned fetch finishes harmlessly in the background.
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !slide || loading || !configured) return;
    const history = messages;
    setMessages(m => [...m, { role: 'user', content: trimmed }]);
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const live = () => !controller.signal.aborted;
    try {
      const finalText = await streamStudyAI(
        pack, slide, history, trimmed,
        text => { if (live()) setStreamingText(text); },
        controller.signal
      );
      if (!live()) return;
      if (finalText.length === 0) {
        // Empty output is a failure, not a clean result.
        setError('Empty response from AI — try again. AI未返回内容，请重试。');
      } else {
        setMessages(m => [...m, { role: 'assistant', content: finalText }]);
      }
    } catch (err) {
      // Surfaced in the overlay via the returned `error` — not swallowed.
      if (live()) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (live()) {
        setStreamingText(null);
        setLoading(false);
      }
    }
  }, [pack, slide, messages, loading, configured]);

  return { messages, streamingText, loading, error, configured, ask, cancel };
}
