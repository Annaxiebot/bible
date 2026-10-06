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
import {
  ASK_AI_LABEL, ASK_INPUT_PLACEHOLDER, ASK_SUBMIT_LABEL, thinkingLine, modelLine,
} from './tvHints';
import { useAskAI, AskAI } from './useAskAI';
import AIErrorLine from './AIErrorLine';
import AskAnswer from './AskAnswer';
import { useAnswerFit } from './useAnswerFit';
import { QuickAISetupForm } from '../setup/QuickAISetup';

// Layout (ADR-0003 §10): the header, the latest question and the input are
// pinned; the conversation area between them takes all remaining height.
// The latest answer shrinks to fit it (useAnswerFit, down to the senior
// floor); earlier turns may scroll out above. Scrolling — a thin themed bar
// — is the last resort when even the floor does not fit.
const questionStyle: React.CSSProperties = { fontSize: '2.5vh', lineHeight: 1.4 };

/** Messages before the latest question, the latest question, and its answer (streaming or stored). */
function splitTurns(ai: AskAI) {
  const lastUser = ai.messages.map(m => m.role).lastIndexOf('user');
  const stored = ai.messages.slice(lastUser + 1).find(m => m.role === 'assistant')?.content ?? null;
  return {
    earlier: lastUser < 0 ? ai.messages : ai.messages.slice(0, lastUser),
    question: lastUser < 0 ? null : ai.messages[lastUser].content,
    answer: ai.streamingText ?? (lastUser < 0 ? null : stored),
    turn: lastUser,
  };
}

const Message: React.FC<{ m: AskAIMessage; pack: StudyPack }> = ({ m, pack }) =>
  m.role === 'user'
    ? <p className="text-stl-text-2" style={questionStyle}>{`Q: ${m.content}`}</p>
    : <AskAnswer text={m.content} pack={pack} />;

const Conversation: React.FC<{ ai: AskAI; pack: StudyPack }> = ({ ai, pack }) => {
  const areaRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<HTMLDivElement>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const onSaved = () => { ai.markConfigured(); setSetupOpen(false); };
  const { earlier, answer, turn } = splitTurns(ai);
  const streaming = ai.streamingText !== null;
  // Keep the latest turn's end in view — after each fit too, since the block
  // also changes height without a new token (lazy markdown, shrink, fonts).
  const scrollToLatest = useCallback(() => {
    // Guarded: jsdom (vitest) does not implement scrollIntoView. No spacer after the block: it would add scroll height.
    if (typeof latestRef.current?.scrollIntoView === 'function') latestRef.current.scrollIntoView({ block: 'end' });
  }, []);
  useAnswerFit(areaRef, latestRef, { text: answer, streaming, turnKey: turn, onFitted: scrollToLatest });
  useEffect(scrollToLatest, [scrollToLatest, ai.messages.length, ai.loading, ai.streamingText]);
  return (
    <div ref={areaRef} className="flex-1 min-h-0 overflow-y-auto tv-thin-scroll space-y-[2vh]" data-testid="ask-conversation">
      {(!ai.configured || setupOpen) && (
        // No AI yet (or opened from an error line): the AI form inline — the
        // sign-in prompt, no key hints (ADR-0007). Signing in or a stored key
        // flips `configured`; a pending question then sends.
        <div className="max-w-3xl">
          <QuickAISetupForm onSaved={onSaved} ownKeyOption={false} onCancel={setupOpen ? () => setSetupOpen(false) : undefined} />
        </div>
      )}
      {earlier.map((m, i) => <Message key={i} m={m} pack={pack} />)}
      <div ref={latestRef} data-testid="ask-latest">
        {answer !== null && (
          <div data-testid={streaming ? 'streaming-answer' : undefined}>
            <AskAnswer text={answer} pack={pack} fit />
          </div>
        )}
        {ai.loading && !streaming && (
          <p className="text-stl-text-3" style={questionStyle} data-testid="ask-thinking">
            {thinkingLine(ai.model ?? '')}
          </p>
        )}
        {ai.error && (
          <AIErrorLine error={ai.error} style={questionStyle} onSetup={() => setSetupOpen(true)} onRetry={() => { void ai.retry(); }} />
        )}
      </div>
    </div>
  );
};

/** Pinned under the header: the question being answered, at most two lines (full text on hover). */
const LatestQuestion: React.FC<{ ai: AskAI }> = ({ ai }) => {
  const { question } = splitTurns(ai);
  if (question === null) return null;
  return (
    <p className="text-stl-text-2 line-clamp-2 mb-[1vh] shrink-0" style={questionStyle} title={question} data-testid="ask-question">
      {`Q: ${question}`}
    </p>
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
    <form onSubmit={submit} className="flex gap-[1vw] mt-[1vh] shrink-0">
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        disabled={!ai.configured || ai.loading}
        placeholder={ASK_INPUT_PLACEHOLDER}
        aria-label="问一问 Ask AI question"
        className="flex-1 min-w-0 bg-stl-surface text-stl-text rounded-lg px-4 border border-stl-border focus:outline-none focus:border-stl-gold"
        style={questionStyle}
      />
      <button
        type="submit"
        disabled={!ai.configured || ai.loading || draft.trim().length === 0}
        className="bg-stl-gold disabled:bg-stl-surface-2 text-stl-bg disabled:text-stl-text-3 font-semibold rounded-lg px-6 whitespace-nowrap shrink-0"
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
      {/* TV: the panel takes nearly the whole screen (2vh/2vw frame over the dim backdrop). */}
      <div className="bg-stl-surface border border-stl-border rounded-xl absolute inset-y-[2vh] inset-x-[2vw] p-[2vh] flex flex-col" data-testid="ask-panel">
        <div className="flex items-center gap-[1vw] mb-[1vh] shrink-0">
          <h2 className="text-stl-gold font-bold mr-auto" style={{ fontSize: '3.5vh' }}>{ASK_AI_LABEL}</h2>
          {!ai.loading && ai.model && ai.messages.some(m => m.role === 'assistant') && (
            <p className="text-stl-text-3 truncate" style={questionStyle} data-testid="ask-model">{modelLine(ai.model)}</p>
          )}
          <button
            onClick={close}
            className="text-stl-text-2 hover:text-stl-text px-3 py-1"
            style={{ fontSize: '3vh' }}
            aria-label="关闭问一问 Close Ask AI"
          >
            ✕
          </button>
        </div>
        <LatestQuestion ai={ai} />
        <Conversation ai={ai} pack={pack} />
        <QuestionForm ai={ai} />
      </div>
    </div>
  );
};

export default AskAIOverlay;
