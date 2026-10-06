/**
 * AIErrorLine.tsx — one AI failure line with its way out · AI错误提示
 *
 * Shared by the TV Ask-AI overlay and the personal app's chat (one
 * component, one fix fixes both). The failure's kind decides which of
 * Retry / Set up AI accompany the line (askAIErrors); only the hosted
 * no-credit / paused lines link to the AI page's own-key option. The
 * caller sizes it: the TV passes viewport-scaled type, the chat its own.
 */
import React from 'react';
import { SETUP_KINDS, RETRY_KINDS, OWN_KEY_LINK_KINDS, AskAIErrorKind } from './askAIErrors';
import { TV_RETRY, AI_OWN_KEY_ON_STATUS_PAGE } from './tvHints';
import { SETUP_OPEN_BUTTON } from '../setup/setupStrings';
import { SETUP_HASH } from '../landing/landingRoute';

const TV_BUTTON_CLASS = 'ml-3 rounded-lg border border-stl-gold px-4 py-1 text-stl-gold';
const TV_LINK_CLASS = 'ml-3 text-stl-gold underline underline-offset-4';

export interface AIErrorLineProps {
  error: { kind: AskAIErrorKind; message: string };
  onSetup: () => void;
  /** Omitted → no Retry button (the caller has no request to repeat). */
  onRetry?: () => void;
  style?: React.CSSProperties;
  className?: string;
  buttonClassName?: string;
  linkClassName?: string;
}

export const AIErrorLine: React.FC<AIErrorLineProps> = ({
  error, onSetup, onRetry, style, className = 'text-red-400', buttonClassName = TV_BUTTON_CLASS, linkClassName = TV_LINK_CLASS,
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
    {OWN_KEY_LINK_KINDS.has(error.kind) && (
      <a href={SETUP_HASH} className={linkClassName} style={style}>
        {AI_OWN_KEY_ON_STATUS_PAGE}
      </a>
    )}
  </p>
);

export default AIErrorLine;
