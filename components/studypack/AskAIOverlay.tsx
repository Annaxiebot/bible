/**
 * AskAIOverlay.tsx — Ask-AI panel over the TV slides · 问AI浮层
 *
 * Opens over the current slide without losing position. Escape (or ✕)
 * closes the overlay only — slide navigation is suspended by the parent
 * while the overlay is open. Q&A is ephemeral (in-memory, per opening).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StudyPack, Slide } from './packTypes';
import { AskAIMessage } from './askAI';
import { SETUP_KINDS, RETRY_KINDS, OWN_KEY_LINK_KINDS } from './askAIErrors';
import {
  ASK_AI_LABEL, ASK_INPUT_PLACEHOLDER, ASK_SUBMIT_LABEL, TV_RETRY, thinkingLine, modelLine, AI_OWN_KEY_ON_STATUS_PAGE,
} from './tvHints';
import { useAskAI, AskAI, AskAIFailure } from './useAskAI';
import AskAnswer from './AskAnswer';
import { QuickAISetupForm } from '../setup/QuickAISetup';
import { SETUP_OPEN_BUTTON } from '../setup/setupStrings';
import { SETUP_HASH } from '../landing/landingRoute';

// Answers render through AskAnswer (markdown + verse tooltips, font scaled
// by length). Overflow scrolls inside Conversation (flex-1 overflow-y-auto)
// so the input/controls never leave the screen.
const questionStyle: React.CSSProperties = { fontSize: '2.5vh', lineHeight: 1.4 };
const inlineButtonClass = 'ml-3 rounded-lg border border-stl-gold px-4 py-1 text-stl-gold';

const Message: React.FC<{ m: AskAIMessage; pack: StudyPack }> = ({ m, pack }) =>
  m.role === 'user'
    ? <p className="text-stl-text-2" style={questionStyle}>{`Q: ${m.content}`}</p>
    : <AskAnswer text={m.content} pack={pack} />;

/**
 * Error line; its kind decides which of Retry / Set up AI accompany it. Only
 * the hosted no-credit / paused lines link to the AI page's own-key option.
 */
const ErrorLine: React.FC<{ error: AskAIFailure; onSetup: () => void; onRetry: () => void }> =
  ({ error, onSetup, onRetry }) => (
    <p className="text-red-400" style={questionStyle} role="alert">
      {error.message}
      {RETRY_KINDS.has(error.kind) && (
        <button type="button" onClick={onRetry} className={inlineButtonClass} style={questionStyle}>
          {TV_RETRY}
        </button>
      )}
      {SETUP_KINDS.has(error.kind) && (
        <button type="button" onClick={onSetup} className={inlineButtonClass} style={questionStyle}>
          {SETUP_OPEN_BUTTON}
        </button>
      )}
      {OWN_KEY_LINK_KINDS.has(error.kind) && (
        <a href={SETUP_HASH} className="ml-3 text-stl-gold underline underline-offset-4" style={questionStyle}>
          {AI_OWN_KEY_ON_STATUS_PAGE}
        </a>
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
        // No AI yet (or opened from an error line): the AI form inline — the
        // sign-in prompt, no key hints (ADR-0007). Signing in or a stored key
        // flips `configured`; a pending question then sends.
        <div className="max-w-3xl">
          <QuickAISetupForm onSaved={onSaved} ownKeyOption={false} onCancel={setupOpen ? () => setSetupOpen(false) : undefined} />
        </div>
      )}
      {ai.messages.map((m, i) => <Message key={i} m={m} pack={pack} />)}
      {ai.streamingText !== null && (
        <div data-testid="streaming-answer">
          <AskAnswer text={ai.streamingText} pack={pack} />
        </div>
      )}
      {ai.loading && ai.streamingText === null && (
        <p className="text-stl-text-3" style={questionStyle} data-testid="ask-thinking">
          {thinkingLine(ai.model ?? '')}
        </p>
      )}
      {!ai.loading && ai.model && ai.messages.some(m => m.role === 'assistant') && (
        <p className="text-stl-text-3" style={questionStyle} data-testid="ask-model">{modelLine(ai.model)}</p>
      )}
      {ai.error && (
        <ErrorLine error={ai.error} onSetup={() => setSetupOpen(true)} onRetry={() => { void ai.retry(); }} />
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
        placeholder={ASK_INPUT_PLACEHOLDER}
        aria-label="问一问 Ask AI question"
        className="flex-1 bg-stl-surface text-stl-text rounded-lg px-4 border border-stl-border focus:outline-none focus:border-stl-gold"
        style={questionStyle}
      />
      <button
        type="submit"
        disabled={!ai.configured || ai.loading || draft.trim().length === 0}
        className="bg-stl-gold disabled:bg-stl-surface-2 text-stl-bg disabled:text-stl-text-3 font-semibold rounded-lg px-6"
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
  // While AI is unavailable the question stays pending; it is sent as soon
  // as the leader signs in or a key is stored (ai.configured flips to true).
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
      // select-text: the TV root is select-none (for swipes); answers must be selectable and copyable.
      className="absolute inset-0 bg-stl-glass flex items-center justify-center cursor-default select-text"
      data-testid="ask-ai-overlay"
      onClick={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onTouchEnd={e => e.stopPropagation()}
    >
      <div className="bg-stl-surface border border-stl-border rounded-xl w-[80vw] h-[80vh] p-[3vh] flex flex-col">
        <div className="flex items-center justify-between mb-[2vh]">
          <h2 className="text-stl-gold font-bold" style={{ fontSize: '3.5vh' }}>{ASK_AI_LABEL}</h2>
          <button
            onClick={close}
            className="text-stl-text-2 hover:text-stl-text px-3 py-1"
            style={{ fontSize: '3vh' }}
            aria-label="关闭问一问 Close Ask AI"
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
