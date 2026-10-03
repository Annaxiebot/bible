/**
 * QuickAISetup.tsx — one-field OpenRouter key setup · 设置AI
 *
 * One paste, one Save: the key is stored under the existing storage key and
 * the shared defaults (OpenRouter + free-models router) are applied, so a
 * new visitor never visits the advanced settings. With a key stored, the
 * three model roles are editable in place (ModelRows). Two shapes of the same
 * form: `QuickAISetupForm` renders inline (the TV Ask-AI overlay),
 * `QuickAISetupDialog` wraps it in a modal (landing page, #/setup).
 * Large type for seniors (ADR-0003 §15): text ≥ 18px, tap targets ≥ 48px.
 * Security: password-style field, key never logged, never in a URL.
 */
import React, { useEffect, useRef } from 'react';
import { OPENROUTER_KEYS_URL } from '../../services/aiDefaults';
import { useQuickAISetup, TestStatus, QuickAISetup } from './useQuickAISetup';
import { ModelRows } from './ModelRows';
import {
  SETUP_TITLE, SETUP_EXPLANATION, SETUP_KEY_LABEL, SETUP_KEY_PLACEHOLDER,
  SETUP_SHOW_KEY, SETUP_HIDE_KEY, SETUP_GET_KEY, SETUP_TEST, SETUP_TESTING,
  SETUP_SAVE, SETUP_CANCEL, SETUP_CLOSE, SETUP_REPLACE, savedKeyLine,
  SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX,
} from './setupStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };

const TestResult: React.FC<{ test: TestStatus }> = ({ test }) => {
  if (test.kind === 'idle' || test.kind === 'testing') return null;
  const ok = test.kind === 'ok';
  return (
    <p role="status" className={ok ? 'text-emerald-300' : 'text-red-300'} style={textStyle}>
      {test.message}
    </p>
  );
};

const secondaryButtonClass = 'rounded-lg border border-slate-600 px-4 text-slate-300 hover:text-slate-100';

/**
 * Saved state: masked key (last 4 only), Replace to reveal the field, and
 * the "模型 Models" rows (Ask AI / pack generation / fallbacks, each with a
 * Recommended reset) that store on every change.
 */
const SavedKeyPanel: React.FC<{ s: QuickAISetup }> = ({ s }) => (
  <div data-testid="saved-state" className="flex flex-col gap-3">
    <p data-testid="saved-key" className="text-emerald-300" style={textStyle}>{savedKeyLine(s.maskedKey ?? '')}</p>
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={s.startReplace} className={secondaryButtonClass} style={controlStyle}>
        {SETUP_REPLACE}
      </button>
    </div>
    <ModelRows textStyle={textStyle} controlStyle={controlStyle} onChanged={s.refreshModel} />
  </div>
);

export interface QuickAISetupFormProps {
  /** Called after the key is stored. */
  onSaved: () => void;
  /** When given, a Cancel button closes the form without saving. */
  onCancel?: () => void;
}

export const QuickAISetupForm: React.FC<QuickAISetupFormProps> = ({ onSaved, onCancel }) => {
  const s = useQuickAISetup();
  const inputRef = useRef<HTMLInputElement>(null);
  // Focus the field when it is on screen: on open without a stored key, and when Replace reveals it.
  useEffect(() => { if (!s.showingSaved) inputRef.current?.focus(); }, [s.showingSaved]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (s.save()) onSaved();
  };

  return (
    <form onSubmit={submit} data-testid="quick-ai-setup" className="flex flex-col gap-4 text-slate-100">
      <h2 className="font-bold text-amber-300" style={{ fontSize: SETUP_MIN_FONT_PX * 1.4 }}>
        {SETUP_TITLE}
      </h2>
      <p className="text-slate-300" style={textStyle}>{SETUP_EXPLANATION}</p>

      {s.showingSaved ? <SavedKeyPanel s={s} /> : (
      <label className="flex flex-col gap-2">
        <span className="text-slate-400" style={textStyle}>{SETUP_KEY_LABEL}</span>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type={s.shown ? 'text' : 'password'}
            value={s.key}
            onChange={e => s.setKey(e.target.value)}
            placeholder={SETUP_KEY_PLACEHOLDER}
            autoComplete="off"
            spellCheck={false}
            aria-label={SETUP_KEY_LABEL}
            aria-invalid={s.error !== null}
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 text-slate-100 focus:border-amber-400 focus:outline-none"
            style={controlStyle}
          />
          <button
            type="button"
            onClick={s.toggleShown}
            aria-pressed={s.shown}
            className="rounded-lg border border-slate-600 px-4 text-slate-300 hover:text-slate-100"
            style={controlStyle}
          >
            {s.shown ? SETUP_HIDE_KEY : SETUP_SHOW_KEY}
          </button>
        </div>
      </label>
      )}
      {s.error && <p role="alert" className="text-red-300" style={textStyle}>{s.error}</p>}
      <TestResult test={s.test} />

      <a
        href={OPENROUTER_KEYS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center self-start text-amber-300 underline underline-offset-4"
        style={controlStyle}
      >
        {SETUP_GET_KEY} ↗
      </a>

      <div className="flex flex-wrap justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-5 text-slate-400 hover:text-slate-100"
            style={controlStyle}
          >
            {SETUP_CANCEL}
          </button>
        )}
        <button
          type="button"
          onClick={() => { void s.runTest(); }}
          disabled={s.test.kind === 'testing'}
          className="rounded-lg border border-slate-500 px-5 text-slate-100 hover:border-amber-400 disabled:opacity-60"
          style={controlStyle}
        >
          {s.test.kind === 'testing' ? SETUP_TESTING : SETUP_TEST}
        </button>
        {!s.showingSaved && (
          <button
            type="submit"
            className="rounded-lg bg-amber-500 px-6 font-semibold text-slate-950 hover:bg-amber-400"
            style={controlStyle}
          >
            {SETUP_SAVE}
          </button>
        )}
      </div>
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
        className="relative w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8"
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
