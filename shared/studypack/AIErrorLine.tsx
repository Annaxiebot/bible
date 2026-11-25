/**
 * AIErrorLine.tsx — one AI failure line with its way out · AI错误提示
 *
 * Shared by the TV Ask-AI overlay and the personal app's chat (one
 * component, one fix fixes both). The failure's kind decides which of
 * Retry / Set up AI accompany the line (askAIErrors). The caller sizes it:
 * the TV passes viewport-scaled type, the chat its own.
 */
import React from 'react';
import { SETUP_KINDS, RETRY_KINDS, AskAIErrorKind } from './askAIErrors';
import { TV_RETRY } from './tvHints';
import { SETUP_OPEN_BUTTON } from '../setup/setupStrings';

const TV_BUTTON_CLASS = 'ml-3 rounded-lg border border-stl-gold px-4 py-1 text-stl-gold';

export interface AIErrorLineProps {
  error: { kind: AskAIErrorKind; message: string };
  onSetup: () => void;
  /** Omitted → no Retry button (the caller has no request to repeat). */
  onRetry?: () => void;
  style?: React.CSSProperties;
  className?: string;
  buttonClassName?: string;
}

export const AIErrorLine: React.FC<AIErrorLineProps> = ({
  error, onSetup, onRetry, style, className = 'text-red-400', buttonClassName = TV_BUTTON_CLASS,
}) => (
  <p className={className} style={style} role="alert">
    {error.message}
    {onRetry && RETRY_KINDS.has(error.kind) && (
      <button type="button" onClick={onRetry} className={buttonClassName} style={style}>
        {TV_RETRY}
      </button>
    )}
    {SETUP_KINDS.has(error.kind) && (
      <button type="button" onClick={onSetup} className={buttonClassName} style={style}>
        {SETUP_OPEN_BUTTON}
      </button>
    )}
  </p>
);

export default AIErrorLine;
