/**
 * AskAnswer.tsx — rich AI answer for the TV overlay · 回答渲染
 *
 * Markdown via the app's shared LazyMarkdown (react-markdown — no raw HTML
 * injection), font scaled by content length so short answers fill a 1080p
 * panel, and verse references turned into VerseTooltip popovers (in-pack
 * from the embedded passage, others from the bundled Bible data).
 */
import React, { useMemo } from 'react';
import LazyMarkdown from '../LazyMarkdown';
import { StudyPack } from './packTypes';
import { linkifyChildren } from './RefLinkedText';
import { TYPE_SCALE } from './principles';
import { fitted } from './slideTypography';

/** Short answers render big so a ≤60-word reply visually fills the panel. */
export function answerFontSize(text: string): string {
  if (text.length <= 120) return TYPE_SCALE.answerShort;
  if (text.length <= 240) return TYPE_SCALE.answerMedium;
  return TYPE_SCALE.answerLong;
}

/** Same leading as the pinned question line: 1.4 keeps 汉字 rows apart and fits one more line. */
const ANSWER_LINE_HEIGHT = 1.4;

/**
 * The latest answer's size in the overlay: its length bucket × var(--fit)
 * (useAnswerFit shrinks --fit down to MIN_ANSWER_SCALE), never below the
 * TV body/verse floor TYPE_SCALE.verse (ADR-0003 §15) whatever the bucket.
 */
export function fittedAnswerFontSize(text: string): string {
  return `max(${TYPE_SCALE.verse}, ${String(fitted({ fontSize: answerFontSize(text) }, false).fontSize)})`;
}

interface MdProps { children?: React.ReactNode }

/**
 * Markdown element overrides: TV spacing + verse-ref linking in text runs.
 * Exported for the memoization test — AskAnswer memoizes this per pack so
 * streaming re-renders do not hand LazyMarkdown a fresh components map
 * (which would re-mount the override tree on every token).
 */
export function mdComponents(pack: StudyPack): Record<string, React.ComponentType<unknown>> {
  const P: React.FC<MdProps> = ({ children }) => (
    <p className="mb-[1.5vh] last:mb-0">{linkifyChildren(children, pack)}</p>
  );
  const Li: React.FC<MdProps> = ({ children }) => (
    <li className="ml-[2vw] list-disc">{linkifyChildren(children, pack)}</li>
  );
  const Strong: React.FC<MdProps> = ({ children }) => (
    <strong className="text-stl-gold-hover">{linkifyChildren(children, pack)}</strong>
  );
  const Em: React.FC<MdProps> = ({ children }) => <em>{linkifyChildren(children, pack)}</em>;
  return {
    p: P, li: Li, strong: Strong, em: Em,
  } as Record<string, React.ComponentType<unknown>>;
}

export interface AskAnswerProps {
  text: string;
  pack: StudyPack;
  /** The overlay's latest answer: sized by the fit (fittedAnswerFontSize). */
  fit?: boolean;
}

const AskAnswer: React.FC<AskAnswerProps> = ({ text, pack, fit = false }) => {
  const components = useMemo(() => mdComponents(pack), [pack]);
  return (
    <div
      className="text-stl-text"
      data-testid="ask-answer"
      style={{ fontSize: fit ? fittedAnswerFontSize(text) : answerFontSize(text), lineHeight: ANSWER_LINE_HEIGHT }}
    >
      <LazyMarkdown components={components}>{text}</LazyMarkdown>
    </div>
  );
};

export default AskAnswer;
