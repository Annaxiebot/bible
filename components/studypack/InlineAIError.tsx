/**
 * InlineAIError.tsx — an AI failure line + its AI service dialog · 行内AI错误
 *
 * The personal app's screens that are not the chat (the journal toolbar,
 * digest, profile, the Notability AI menu) show a failed AI action the way
 * the chat does: the shared AIErrorLine (sign-in line with 设置AI, quota,
 * credit, network + Retry…), and its 设置AI button opens the AI service
 * dialog right here. `useAIFailures` keeps one typed failure per action key
 * so each line sits next to the control that was clicked and clears on retry
 * or success. No new error model: everything is an AskAIError (askAIErrors).
 */
import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import AIErrorLine from './AIErrorLine';
import { AskAIError, asAskAIError } from './askAIErrors';
import { QuickAISetupDialog } from '../setup/QuickAISetup';
import { askAIModel } from '../../services/aiDefaults';

/** Light-UI styling (the personal app); the TV keeps AIErrorLine's own defaults. */
export const LIGHT_AI_ERROR_CLASS = 'text-sm text-red-600';
export const LIGHT_AI_ERROR_BUTTON_CLASS = 'ml-2 rounded-lg border border-indigo-300 px-3 py-0.5 text-indigo-600 hover:bg-indigo-50';
export const LIGHT_AI_ERROR_LINK_CLASS = 'ml-2 text-indigo-600 underline underline-offset-4';

/** Above every full-screen host the line can sit in (the Notability overlay is 9998, its popovers 10000). */
const SETUP_DIALOG_Z_INDEX = 10001;

export interface InlineAIErrorProps {
  error: AskAIError;
  /** Omitted → no Retry button. */
  onRetry?: () => void;
  testId?: string;
  style?: React.CSSProperties;
}

export const InlineAIError: React.FC<InlineAIErrorProps> = ({ error, onRetry, testId, style }) => {
  const [setupOpen, setSetupOpen] = useState(false);
  const closeSetup = useCallback(() => setSetupOpen(false), []);
  return (
    <div data-testid={testId} style={style}>
      <AIErrorLine
        error={error}
        onSetup={() => setSetupOpen(true)}
        onRetry={onRetry}
        className={LIGHT_AI_ERROR_CLASS}
        buttonClassName={LIGHT_AI_ERROR_BUTTON_CLASS}
        linkClassName={LIGHT_AI_ERROR_LINK_CLASS}
      />
      {/* Portalled: a host toolbar (Notability) is a containing block that would clip a fixed modal. */}
      {setupOpen && createPortal(
        <div style={{ position: 'relative', zIndex: SETUP_DIALOG_Z_INDEX }}><QuickAISetupDialog open onClose={closeSetup} /></div>,
        document.body,
      )}
    </div>
  );
};

export interface AIFailures<K extends string> {
  errors: Partial<Record<K, AskAIError>>;
  /** Record a failed action (anything thrown becomes an AskAIError). */
  fail: (key: K, err: unknown) => void;
  /** Forget an action's failure (call when it starts again). */
  clear: (key: K) => void;
}

export function useAIFailures<K extends string>(): AIFailures<K> {
  const [errors, setErrors] = useState<Partial<Record<K, AskAIError>>>({});
  const fail = useCallback((key: K, err: unknown) => {
    setErrors(prev => ({ ...prev, [key]: asAskAIError(err, askAIModel()) }));
  }, []);
  const clear = useCallback((key: K) => {
    setErrors(prev => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);
  return { errors, fail, clear };
}

export default InlineAIError;
