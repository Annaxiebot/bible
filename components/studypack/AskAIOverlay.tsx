/**
 * AskAIOverlay.tsx — Ask-AI panel over the TV slides · 问AI浮层
 *
 * Opens over the current slide without losing position. Escape (or ✕)
 * closes the overlay only — slide navigation is suspended by the parent
 * while the overlay is open. Q&A is ephemeral (in-memory, per opening).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StudyPack, Slide } from './packTypes';
import { AskAIMessage, AI_CREDITS_MESSAGE } from './askAI';
import { ASK_AI_LABEL, ASK_INPUT_PLACEHOLDER, ASK_SUBMIT_LABEL, TV_THINKING } from './tvHints';
import { useAskAI, AskAI } from './useAskAI';
import AskAnswer from './AskAnswer';
import { QuickAISetupForm } from '../setup/QuickAISetup';
import { SETUP_TITLE } from '../setup/setupStrings';

// Answers render through AskAnswer (markdown + verse tooltips, font scaled
// by length). Overflow scrolls inside Conversation (flex-1 overflow-y-auto)
// so the input/controls never leave the screen.
const questionStyle: React.CSSProperties = { fontSize: '2.5vh', lineHeight: 1.4 };

const Message: React.FC<{ m: AskAIMessage; pack: StudyPack }> = ({ m, pack }) =>
  m.role === 'user'
    ? <p className="text-slate-400" style={questionStyle}>{`Q: ${m.content}`}</p>
    : <AskAnswer text={m.content} pack={pack} />;

/** Error line; a credits (402) error also offers the inline setup. */
const ErrorLine: React.FC<{ error: string; onSetup: () => void }> = ({ error, onSetup }) => (
  <p className="text-red-400" style={questionStyle} role="alert">
    {error}
    {error === AI_CREDITS_MESSAGE && (
      <button
        type="button"
        onClick={onSetup}
        className="ml-3 rounded-lg border border-amber-400 px-4 py-1 text-amber-300"
        style={questionStyle}
      >
        {SETUP_TITLE}
      </button>
    )}
  </p>
);

const Conversation: React.FC<{ ai: AskAI; pack: StudyPack }> = ({ ai, pack }) => {
  const endRef = useRef<HTMLDivElement>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const onSaved = () => { ai.markConfigured(); setSetupOpen(false); };
  useEffect(() => {
    // Guarded: jsdom (vitest) does not implement scrollIntoView.
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' });
    }
  }, [ai.messages.length, ai.loading, ai.streamingText]);
  return (
    <div className="flex-1 overflow-y-auto space-y-[2vh]">
      {(!ai.configured || setupOpen) && (
        // Unconfigured (or opened from a credits error): the one-field key
        // setup, inline. Saving flips `configured`; a pending question sends.
        <div className="max-w-3xl">
          <QuickAISetupForm onSaved={onSaved} onCancel={setupOpen ? () => setSetupOpen(false) : undefined} />
        </div>
      )}
      {ai.messages.map((m, i) => <Message key={i} m={m} pack={pack} />)}
      {ai.streamingText !== null && (
        <div data-testid="streaming-answer">
          <AskAnswer text={ai.streamingText} pack={pack} />
        </div>
      )}
      {ai.loading && ai.streamingText === null && (
        <p className="text-slate-500" style={questionStyle}>{TV_THINKING}</p>
      )}
      {ai.error && <ErrorLine error={ai.error} onSetup={() => setSetupOpen(true)} />}
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
        placeholder={ASK_INPUT_PLACEHOLDER}
        aria-label="问AI问题 Ask AI question"
        className="flex-1 bg-slate-800 text-slate-100 rounded-lg px-4 border border-slate-600 focus:outline-none focus:border-amber-400"
        style={questionStyle}
      />
      <button
        type="submit"
        disabled={!ai.configured || ai.loading || draft.trim().length === 0}
        className="bg-amber-500 disabled:bg-slate-700 text-slate-950 disabled:text-slate-500 font-semibold rounded-lg px-6"
        style={questionStyle}
      >
        {ASK_SUBMIT_LABEL}
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
  const close = useCallback(() => {
    ai.cancel(); // abort an in-flight stream before leaving
    onClose();
  }, [ai, onClose]);

  // One-click smart open: submit the initial question immediately, once.
  // While unconfigured the question stays pending; it is sent as soon as
  // the inline setup stores a key (ai.configured flips to true).
  useEffect(() => {
    if (!initialQuestion || autoSentRef.current || !ai.configured) return;
    autoSentRef.current = true;
    void ai.ask(initialQuestion);
  }, [initialQuestion, ai]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

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
          <h2 className="text-amber-300 font-bold" style={{ fontSize: '3.5vh' }}>{ASK_AI_LABEL}</h2>
          <button
            onClick={close}
            className="text-slate-400 hover:text-slate-100 px-3 py-1"
            style={{ fontSize: '3vh' }}
            aria-label="关闭问AI Close Ask AI"
          >
            ✕
          </button>
        </div>
        <Conversation ai={ai} pack={pack} />
        <QuestionForm ai={ai} />
      </div>
    </div>
  );
};

export default AskAIOverlay;
