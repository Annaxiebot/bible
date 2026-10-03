/**
 * OwnKeySection.tsx — the hidden own-key path of the AI service page · 自己的密钥
 *
 * Owner decision (ADR-0007): every signed-in leader uses the site's AI; the
 * own OpenRouter key stays possible but out of the way — collapsed behind a
 * small, low-emphasis text toggle at the bottom of the page. Open, below it:
 * the one-field key form (paste, Show, Test, Save, get-a-key link), or the
 * saved state (last 4 only + Replace), the "模型 Models" rows (they apply to
 * the own-key path only) and the sync line. Open by default when a key is
 * stored. Security: password-style field, key never logged, never in a URL.
 */
import React, { useEffect, useRef, useState } from 'react';
import { OPENROUTER_KEYS_URL } from '../../services/aiDefaults';
import { TestStatus, QuickAISetup } from './useQuickAISetup';
import { ModelRows } from './ModelRows';
import { SyncLine } from './SyncLine';
import {
  SETUP_EXPLANATION, SETUP_KEY_LABEL, SETUP_KEY_PLACEHOLDER, SETUP_SHOW_KEY, SETUP_HIDE_KEY, SETUP_GET_KEY,
  SETUP_TEST, SETUP_TESTING, SETUP_SAVE, SETUP_REPLACE, SETUP_OWN_KEY_TOGGLE, savedKeyLine,
  SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX,
} from './setupStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };
const secondaryButtonClass = 'rounded-lg border border-slate-600 px-4 text-slate-300 hover:text-slate-100';

const TestResult: React.FC<{ test: TestStatus }> = ({ test }) => {
  if (test.kind === 'idle' || test.kind === 'testing') return null;
  const ok = test.kind === 'ok';
  return (
    <p role="status" className={ok ? 'text-emerald-300' : 'text-red-300'} style={textStyle}>
      {test.message}
    </p>
  );
};

/** Saved state: masked key (last 4 only) and Replace to reveal the field. */
const SavedKey: React.FC<{ s: QuickAISetup }> = ({ s }) => (
  <div data-testid="saved-state" className="flex flex-col gap-3">
    <p data-testid="saved-key" className="text-emerald-300" style={textStyle}>{savedKeyLine(s.maskedKey ?? '')}</p>
    <button type="button" onClick={s.startReplace} className={`self-start ${secondaryButtonClass}`} style={controlStyle}>
      {SETUP_REPLACE}
    </button>
  </div>
);

const KeyField: React.FC<{ s: QuickAISetup }> = ({ s }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
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
        <button type="button" onClick={s.toggleShown} aria-pressed={s.shown} className={secondaryButtonClass} style={controlStyle}>
          {s.shown ? SETUP_HIDE_KEY : SETUP_SHOW_KEY}
        </button>
      </div>
    </label>
  );
};

const KeyActions: React.FC<{ s: QuickAISetup }> = ({ s }) => (
  <div className="flex flex-wrap justify-end gap-3">
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
      <button type="submit" className="rounded-lg bg-amber-500 px-6 font-semibold text-slate-950 hover:bg-amber-400" style={controlStyle}>
        {SETUP_SAVE}
      </button>
    )}
  </div>
);

export interface OwnKeySectionProps {
  s: QuickAISetup;
  /** Open on first render (a key is stored, or Replace is in progress). */
  initiallyOpen: boolean;
}

export const OwnKeySection: React.FC<OwnKeySectionProps> = ({ s, initiallyOpen }) => {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <div className="flex flex-col gap-4 border-t border-stl-border pt-3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="self-start text-left text-stl-text-3 underline underline-offset-4 hover:text-stl-text-2"
        style={controlStyle}
      >
        {SETUP_OWN_KEY_TOGGLE}
      </button>
      {open && (
        <div data-testid="own-key-section" className="flex flex-col gap-4">
          <p className="text-slate-300" style={textStyle}>{SETUP_EXPLANATION}</p>
          {s.showingSaved ? <SavedKey s={s} /> : <KeyField s={s} />}
          {s.error && <p role="alert" className="text-red-300" style={textStyle}>{s.error}</p>}
          <TestResult test={s.test} />
          <a href={OPENROUTER_KEYS_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center self-start text-amber-300 underline underline-offset-4" style={controlStyle}>
            {SETUP_GET_KEY} ↗
          </a>
          <KeyActions s={s} />
          <ModelRows textStyle={textStyle} controlStyle={controlStyle} onChanged={s.refreshModel} />
          <SyncLine textStyle={textStyle} controlStyle={controlStyle} />
        </div>
      )}
    </div>
  );
};
