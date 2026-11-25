/**
 * QuickAISetup.tsx — the AI service page / form · AI 服务
 *
 * A status page since hosted AI (ADR-0007), and the only way to use AI is to
 * sign in (2026-10-23: the own-key option was removed). Signed in →
 * "已登录 · AI 已就绪（由本站提供）" + this month's usage; signed out →
 * "登录即可使用AI" + the sign-in choices (AIStatus). Two shapes of the same
 * form: `QuickAISetupForm` renders inline (the TV Ask-AI overlay, New study),
 * `QuickAISetupDialog` wraps it in a modal (landing page, #/setup, the
 * personal app). Large type for seniors (ADR-0003 §15).
 */
import React, { useEffect } from 'react';
import { useAIAccess } from './useAIAccess';
import { HostedReady, SignInToUseAI } from './AIStatus';
import { SETUP_TITLE, SETUP_CANCEL, SETUP_CLOSE, SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from './setupStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };

export interface QuickAISetupFormProps {
  /** When given, a Cancel button closes the form. */
  onCancel?: () => void;
}

export const QuickAISetupForm: React.FC<QuickAISetupFormProps> = ({ onCancel }) => {
  const access = useAIAccess();
  return (
    <div data-testid="quick-ai-setup" className="flex flex-col gap-4 text-stl-text">
      <h2 className="font-bold text-stl-gold" style={{ fontSize: SETUP_MIN_FONT_PX * 1.4 }}>
        {SETUP_TITLE}
      </h2>
      {access.uid ? <HostedReady uid={access.uid} /> : <SignInToUseAI />}
      {onCancel && (
        <button type="button" onClick={onCancel} className="self-end rounded-lg px-5 text-stl-text-2 hover:text-stl-text" style={controlStyle}>
          {SETUP_CANCEL}
        </button>
      )}
    </div>
  );
};

export interface QuickAISetupDialogProps {
  open: boolean;
  onClose: () => void;
}

/** Modal wrapper: Escape or the backdrop closes it. */
export const QuickAISetupDialog: React.FC<QuickAISetupDialogProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      data-testid="quick-ai-setup-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={SETUP_TITLE}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8"
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={SETUP_CLOSE}
          className="absolute right-3 top-3 px-3 text-slate-400 hover:text-slate-100"
          style={controlStyle}
        >
          ✕
        </button>
        <QuickAISetupForm />
      </div>
    </div>
  );
};

export default QuickAISetupDialog;
