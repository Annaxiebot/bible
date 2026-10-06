/**
 * AskAnswer.tsx — rich AI answer for the TV overlay · 回答渲染
 *
 * Markdown via the app's shared LazyMarkdown (react-markdown — no raw HTML
 * injection), font scaled by content length so short answers fill a 1080p
 * panel, and verse references turned into VerseTooltip popovers (in-pack
 * from the embedded passage, others from the bundled Bible data). Once the
 * answer is complete its references are checked (useCitationCheck): a ref
 * that does not exist loses its popover and gets NO_SUCH_VERSE_MARK, and the
 * overlay's latest answer (fit) lists the cited outside verses (CitedVerses).
 */
import React, { createContext, useContext, useMemo } from 'react';
import LazyMarkdown from '../LazyMarkdown';
import { StudyPack } from './packTypes';
import { linkifyChildren } from './RefLinkedText';
import { TYPE_SCALE } from './principles';
import { fitted } from './slideTypography';
import { useCitationCheck, NO_CITATION_CHECK } from './useCitationCheck';
import CitedVerses from './CitedVerses';

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

/** Refs (as written) the citation check found not to exist. */
const InvalidRefs = createContext<ReadonlySet<string>>(NO_CITATION_CHECK.invalid);

const Linked: React.FC<MdProps & { pack: StudyPack }> = ({ children, pack }) => (
  <>{linkifyChildren(children, pack, useContext(InvalidRefs))}</>
);

/**
 * Markdown element overrides: TV spacing + verse-ref linking in text runs.
 * Exported for the memoization test — AskAnswer memoizes this per pack so
 * streaming re-renders do not hand LazyMarkdown a fresh components map
 * (which would re-mount the override tree on every token). The citation
 * check's invalid refs arrive through InvalidRefs context for the same
 * reason: a settled check must not re-mount (and close) open popovers.
 */
export function mdComponents(pack: StudyPack): Record<string, React.ComponentType<unknown>> {
  const link = (children: React.ReactNode) => <Linked pack={pack}>{children}</Linked>;
  const P: React.FC<MdProps> = ({ children }) => <p className="mb-[1.5vh] last:mb-0">{link(children)}</p>;
  const Li: React.FC<MdProps> = ({ children }) => <li className="ml-[2vw] list-disc">{link(children)}</li>;
  const Strong: React.FC<MdProps> = ({ children }) => <strong className="text-stl-gold-hover">{link(children)}</strong>;
  const Em: React.FC<MdProps> = ({ children }) => <em>{link(children)}</em>;
  return {
    p: P, li: Li, strong: Strong, em: Em,
  } as Record<string, React.ComponentType<unknown>>;
}

export interface AskAnswerProps {
  text: string;
  pack: StudyPack;
  /** The overlay's latest answer: sized by the fit (fittedAnswerFontSize), with the cited-verses block. */
  fit?: boolean;
  /** False while the answer streams: references are checked only once it is complete. */
  complete?: boolean;
}

const AskAnswer: React.FC<AskAnswerProps> = ({ text, pack, fit = false, complete = true }) => {
  const { invalid, cited } = useCitationCheck(text, pack, complete);
  const components = useMemo(() => mdComponents(pack), [pack]);
  return (
    <div
      className="text-stl-text"
      data-testid="ask-answer"
      style={{ fontSize: fit ? fittedAnswerFontSize(text) : answerFontSize(text), lineHeight: ANSWER_LINE_HEIGHT }}
    >
      <InvalidRefs.Provider value={invalid}>
        <LazyMarkdown components={components}>{text}</LazyMarkdown>
      </InvalidRefs.Provider>
      {fit && <CitedVerses cited={cited} />}
    </div>
  );
};

export default AskAnswer;
