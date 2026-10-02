/**
 * useAskAI.ts — overlay Q&A state for TV presentation mode · 问AI状态
 *
 * Ephemeral, in-memory conversation: messages, loading, and error state.
 * Provider calls go through the askAI.ts adapter (OpenRouter).
 */
import { useState, useCallback } from 'react';
import { StudyPack, Slide } from './packTypes';
import { askStudyAI, isAskAIConfigured, AskAIMessage } from './askAI';

export interface AskAI {
  messages: AskAIMessage[];
  loading: boolean;
  error: string | null;
  configured: boolean;
  ask: (question: string) => Promise<void>;
}

export function useAskAI(pack: StudyPack, slide: Slide | undefined): AskAI {
  const [messages, setMessages] = useState<AskAIMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configured] = useState(isAskAIConfigured);

  const ask = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !slide || loading || !configured) return;
    const history = messages;
    setMessages(m => [...m, { role: 'user', content: trimmed }]);
    setLoading(true);
    setError(null);
    try {
      const answer = await askStudyAI(pack, slide, history, trimmed);
      setMessages(m => [...m, { role: 'assistant', content: answer }]);
    } catch (err) {
      // Surfaced in the overlay via the returned `error` — not swallowed.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [pack, slide, messages, loading, configured]);

  return { messages, loading, error, configured, ask };
}
