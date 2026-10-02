/**
 * AskAnswer.tsx — rich AI answer for the TV overlay · 回答渲染
 *
 * Markdown via the app's shared LazyMarkdown (react-markdown — no raw HTML
 * injection), font scaled by content length so short answers fill a 1080p
 * panel, and verse references turned into VerseTooltip popovers resolved
 * against the current pack's embedded passage.
 */
import React from 'react';
import LazyMarkdown from '../LazyMarkdown';
import { StudyPack } from './packTypes';
import { findVerseRefs, packVerseIndex, packChapter, resolveRef } from './verseRefs';
import VerseTooltip from './VerseTooltip';

/** Short answers render big so a ≤60-word reply visually fills the panel. */
export function answerFontSize(text: string): string {
  if (text.length <= 120) return '5vh';
  if (text.length <= 240) return '4vh';
  return '3vh';
}

/** One string → text fragments interleaved with verse-ref spans. */
function linkString(text: string, pack: StudyPack): React.ReactNode[] {
  const index = packVerseIndex(pack);
  const chapter = packChapter(pack);
  const out: React.ReactNode[] = [];
  let cursor = 0;
  findVerseRefs(text).forEach((ref, i) => {
    if (ref.index > cursor) out.push(text.slice(cursor, ref.index));
    const verses = resolveRef(ref, index, chapter);
    out.push(verses.length > 0
      ? <VerseTooltip key={i} label={ref.text} verses={verses} />
      : <span key={i} className="text-amber-200">{ref.text}</span>);
    cursor = ref.index + ref.length;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function withRefs(children: React.ReactNode, pack: StudyPack): React.ReactNode {
  return React.Children.map(children, child =>
    typeof child === 'string' ? linkString(child, pack) : child
  );
}

interface MdProps { children?: React.ReactNode }

/** Markdown element overrides: TV spacing + verse-ref linking in text runs. */
function mdComponents(pack: StudyPack): Record<string, React.ComponentType<unknown>> {
  const P: React.FC<MdProps> = ({ children }) => (
    <p className="mb-[1.5vh]">{withRefs(children, pack)}</p>
  );
  const Li: React.FC<MdProps> = ({ children }) => (
    <li className="ml-[2vw] list-disc">{withRefs(children, pack)}</li>
  );
  const Strong: React.FC<MdProps> = ({ children }) => (
    <strong className="text-amber-100">{withRefs(children, pack)}</strong>
  );
  const Em: React.FC<MdProps> = ({ children }) => <em>{withRefs(children, pack)}</em>;
  return {
    p: P, li: Li, strong: Strong, em: Em,
  } as Record<string, React.ComponentType<unknown>>;
}

export interface AskAnswerProps {
  text: string;
  pack: StudyPack;
}

const AskAnswer: React.FC<AskAnswerProps> = ({ text, pack }) => (
  <div
    className="text-slate-100"
    data-testid="ask-answer"
    style={{ fontSize: answerFontSize(text), lineHeight: 1.45 }}
  >
    <LazyMarkdown components={mdComponents(pack)}>{text}</LazyMarkdown>
  </div>
);

export default AskAnswer;
