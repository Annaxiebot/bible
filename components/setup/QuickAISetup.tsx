/**
 * QuickAISetup.tsx — the AI service page / form · AI 服务
 *
 * A status page since hosted AI (ADR-0007). Primary content is one status:
 * signed in → "已登录 · AI 已就绪（由本站提供）" + this month's usage; signed
 * out → "登录即可使用AI" + the Google button (AIStatus). The own OpenRouter
 * key path (key field, Test, Save, the "模型 Models" rows, the sync line)
 * sits collapsed behind a low-emphasis toggle at the bottom (OwnKeySection),
 * open by default once a key is stored — then it is the primary path and
 * the status line is not shown. Two shapes of the same form:
 * `QuickAISetupForm` renders inline (the TV Ask-AI overlay, New study — there
 * `ownKeyOption={false}` hides the toggle unless a key is already stored, so
 * nothing outside this page hints at keys), `QuickAISetupDialog` wraps it in
 * a modal (landing page, #/setup). Large type for seniors (ADR-0003 §15).
 */
import React, { useEffect } from 'react';
import { useQuickAISetup } from './useQuickAISetup';
import { useAIAccess } from './useAIAccess';
import { HostedReady, SignInToUseAI } from './AIStatus';
import { OwnKeySection } from './OwnKeySection';
import { SETUP_TITLE, SETUP_CANCEL, SETUP_CLOSE, SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from './setupStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };

export interface QuickAISetupFormProps {
  /** Called after an own key is stored. */
  onSaved: () => void;
  /** When given, a Cancel button closes the form without saving. */
  onCancel?: () => void;
  /** Show the own-key toggle (the AI service page). Inline gates pass false; a stored key always shows its section. */
  ownKeyOption?: boolean;
}

export const QuickAISetupForm: React.FC<QuickAISetupFormProps> = ({ onSaved, onCancel, ownKeyOption = true }) => {
  const s = useQuickAISetup();
  const access = useAIAccess();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!s.save()) return;
    access.refresh();
    onSaved();
  };

  return (
    <form onSubmit={submit} data-testid="quick-ai-setup" className="flex flex-col gap-4 text-stl-text">
      <h2 className="font-bold text-stl-gold" style={{ fontSize: SETUP_MIN_FONT_PX * 1.4 }}>
        {SETUP_TITLE}
      </h2>
      {!access.ownKey && (access.uid ? <HostedReady uid={access.uid} /> : <SignInToUseAI />)}
      {(ownKeyOption || access.ownKey) && <OwnKeySection s={s} initiallyOpen={access.ownKey} />}
      {onCancel && (
        <button type="button" onClick={onCancel} className="self-end rounded-lg px-5 text-stl-text-2 hover:text-stl-text" style={controlStyle}>
          {SETUP_CANCEL}
        </button>
      )}
    </form>
  );
};

export interface QuickAISetupDialogProps {
  open: boolean;
  onClose: () => void;
  /** Optional hook after a successful save (the dialog closes either way). */
  onSaved?: () => void;
}

/** Modal wrapper: Escape or the backdrop closes it. */
export const QuickAISetupDialog: React.FC<QuickAISetupDialogProps> = ({ open, onClose, onSaved }) => {
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
        <QuickAISetupForm onSaved={() => { onSaved?.(); onClose(); }} />
      </div>
    </div>
  );
};

export default QuickAISetupDialog;
