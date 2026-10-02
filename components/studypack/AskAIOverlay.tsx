/**
 * AskAIOverlay.tsx — Ask-AI panel over the TV slides · 问AI浮层
 *
 * Opens over the current slide without losing position. Escape (or ✕)
 * closes the overlay only — slide navigation is suspended by the parent
 * while the overlay is open. Q&A is ephemeral (in-memory, per opening).
 */
import React, { useState, useEffect, useRef } from 'react';
import { StudyPack, Slide } from './packTypes';
import { AI_NOT_CONFIGURED_MESSAGE, AskAIMessage } from './askAI';
import { useAskAI, AskAI } from './useAskAI';

// 3vh ≈ 32px at 1080p: a ≤60-word answer fits in ~4-6 lines of the panel
// without scrolling; longer answers scroll inside Conversation (flex-1
// overflow-y-auto) so the input/controls never leave the screen.
const answerStyle: React.CSSProperties = { fontSize: '3vh', lineHeight: 1.45 };
const questionStyle: React.CSSProperties = { fontSize: '2.5vh', lineHeight: 1.4 };

const Message: React.FC<{ m: AskAIMessage }> = ({ m }) => (
  <p
    className={m.role === 'user' ? 'text-slate-400' : 'text-slate-100'}
    style={m.role === 'user' ? questionStyle : answerStyle}
  >
    {m.role === 'user' ? `Q: ${m.content}` : m.content}
  </p>
);

const Conversation: React.FC<{ ai: AskAI }> = ({ ai }) => {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Guarded: jsdom (vitest) does not implement scrollIntoView.
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' });
    }
  }, [ai.messages.length, ai.loading]);
  return (
    <div className="flex-1 overflow-y-auto space-y-[2vh]">
      {!ai.configured && (
        <p className="text-amber-200" style={answerStyle} role="alert">
          {AI_NOT_CONFIGURED_MESSAGE}
        </p>
      )}
      {ai.messages.map((m, i) => <Message key={i} m={m} />)}
      {ai.loading && <p className="text-slate-500" style={questionStyle}>Thinking… 思考中…</p>}
      {ai.error && (
        <p className="text-red-400" style={questionStyle} role="alert">{ai.error}</p>
      )}
      <div ref={endRef} />
    </div>
  );
};

const QuestionForm: React.FC<{ ai: AskAI }> = ({ ai }) => {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void ai.ask(draft);
    setDraft('');
  };
  return (
    <form onSubmit={submit} className="flex gap-[1vw] mt-[2vh]">
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        disabled={!ai.configured || ai.loading}
        placeholder="Ask about this passage… 对这段经文提问…"
        aria-label="Ask AI question 问AI问题"
        className="flex-1 bg-slate-800 text-slate-100 rounded-lg px-4 border border-slate-600 focus:outline-none focus:border-amber-400"
        style={questionStyle}
      />
      <button
        type="submit"
        disabled={!ai.configured || ai.loading || draft.trim().length === 0}
        className="bg-amber-500 disabled:bg-slate-700 text-slate-950 disabled:text-slate-500 font-semibold rounded-lg px-6"
        style={questionStyle}
      >
        Ask 提问
      </button>
    </form>
  );
};

export interface AskAIOverlayProps {
  pack: StudyPack;
  slide: Slide | undefined;
  /** Auto-sent as the first prompt on open (discussion question / selection). */
  initialQuestion?: string | null;
  onClose: () => void;
}

const AskAIOverlay: React.FC<AskAIOverlayProps> = ({ pack, slide, initialQuestion, onClose }) => {
  const ai = useAskAI(pack, slide);
  const autoSentRef = useRef(false);

  // One-click smart open: submit the initial question immediately, once.
  // ai.ask() itself no-ops when the provider is not configured, so the
  // unconfigured overlay still just shows the setup message.
  useEffect(() => {
    if (!initialQuestion || autoSentRef.current) return;
    autoSentRef.current = true;
    void ai.ask(initialQuestion);
  }, [initialQuestion, ai]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 bg-slate-950/90 flex items-center justify-center cursor-default"
      data-testid="ask-ai-overlay"
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-[80vw] h-[80vh] p-[3vh] flex flex-col">
        <div className="flex items-center justify-between mb-[2vh]">
          <h2 className="text-amber-300 font-bold" style={{ fontSize: '3.5vh' }}>Ask AI 问AI</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 px-3 py-1"
            style={{ fontSize: '3vh' }}
            aria-label="Close Ask AI 关闭问AI"
          >
            ✕
          </button>
        </div>
        <Conversation ai={ai} />
        <QuestionForm ai={ai} />
      </div>
    </div>
  );
};

export default AskAIOverlay;
