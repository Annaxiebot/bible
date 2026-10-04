/**
 * SignupForm.tsx — the two-step sign-up · 报名表单
 *
 * Step 1 (PracticeStep): the commitment — any number of life-menu
 * practices (at least one), an optional own version; Next is gated on a choice.
 * Step 2: name (required), email (recommended), phone (optional, with the
 * SMS-not-yet hint), consent (default on). Large type and ≥48px targets
 * from newStudyStyles (ADR-0003 §15). Validation and submit errors render
 * inline (role=alert); the parent owns the insert.
 */
import React, { useState } from 'react';
import type { LifeMenuRow } from '../studypack/packTypes';
import { SignupForm as SignupFormValues, EMPTY_SIGNUP, validateSignup, validatePractice, practiceLines } from './signupClient';
import PracticeStep from './PracticeStep';
import {
  SU_NAME, SU_PHONE, SU_PHONE_HINT, SU_EMAIL, SU_CONSENT, SU_SUBMIT, SU_SUBMITTING, SU_PRIVACY,
  SU_NEXT_STEP, SU_PREV_STEP, SU_CONTACT_TITLE, commitmentLine,
} from './signupStrings';
import {
  textStyle, controlStyle, headingStyle, inputClass, primaryButtonClass, quietButtonClass, labelClass,
} from '../newstudy/newStudyStyles';

export { EMPTY_SIGNUP };

interface Props {
  /** The pack's life menu: the practices to choose from. */
  rows: LifeMenuRow[];
  /** Resolves when the row is stored; rejects with a bilingual Error to show. */
  onSubmit: (form: SignupFormValues) => Promise<void>;
}

const checkboxStyle: React.CSSProperties = { width: 28, height: 28, accentColor: '#f59e0b' };

const ContactFields: React.FC<{ form: SignupFormValues; set: (patch: Partial<SignupFormValues>) => void }> = ({ form, set }) => (
  <>
    <label className={labelClass} style={textStyle}>
      <span>{SU_NAME}</span>
      <input data-testid="su-name" className={inputClass} style={controlStyle} autoComplete="name"
        value={form.name} onChange={e => set({ name: e.target.value })} />
    </label>
    <label className={labelClass} style={textStyle}>
      <span>{SU_EMAIL}</span>
      <input data-testid="su-email" className={inputClass} style={controlStyle} type="email" inputMode="email" autoComplete="email"
        value={form.email} onChange={e => set({ email: e.target.value })} />
    </label>
    <label className={labelClass} style={textStyle}>
      <span>{SU_PHONE}</span>
      <input data-testid="su-phone" className={inputClass} style={controlStyle} type="tel" inputMode="tel" autoComplete="tel"
        value={form.phone} onChange={e => set({ phone: e.target.value })} />
      <span className="text-slate-500">{SU_PHONE_HINT}</span>
    </label>
    <label className="flex items-center gap-3 text-slate-100" style={controlStyle}>
      <input data-testid="su-consent" type="checkbox" style={checkboxStyle}
        checked={form.consent} onChange={e => set({ consent: e.target.checked })} />
      <span>{SU_CONSENT}</span>
    </label>
  </>
);

const SignupForm: React.FC<Props> = ({ rows, onSubmit }) => {
  const [form, setForm] = useState<SignupFormValues>(EMPTY_SIGNUP);
  const [step, setStep] = useState<'practice' | 'contact'>('practice');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SignupFormValues>) => { setForm(f => ({ ...f, ...patch })); setError(null); };

  const next = () => {
    const problem = validatePractice(form);
    if (problem) { setError(problem); return; }
    setError(null);
    setStep('contact');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateSignup(form);
    if (problem) { setError(problem); return; }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form data-testid="signup-form" data-step={step} onSubmit={submit} noValidate className="flex flex-col gap-5">
      {step === 'practice' ? (
        <>
          <PracticeStep rows={rows} value={form} onChange={choice => set(choice)} />
          <button type="button" data-testid="su-next" onClick={next} className={primaryButtonClass} style={controlStyle}>
            {SU_NEXT_STEP}
          </button>
        </>
      ) : (
        <>
          {practiceLines(form).map((line, i) => (
            <p key={i} data-testid="su-commitment" className="text-amber-300" style={textStyle}>{commitmentLine(line)}</p>
          ))}
          <h2 className="font-bold text-amber-300" style={headingStyle}>{SU_CONTACT_TITLE}</h2>
          <ContactFields form={form} set={set} />
          <div className="flex flex-wrap gap-3">
            <button type="button" data-testid="su-prev" onClick={() => setStep('practice')} className={quietButtonClass} style={controlStyle}>
              {SU_PREV_STEP}
            </button>
            <button type="submit" data-testid="su-submit" disabled={busy} className={primaryButtonClass} style={controlStyle}>
              {busy ? SU_SUBMITTING : SU_SUBMIT}
            </button>
          </div>
        </>
      )}
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      <p className="text-slate-500" style={textStyle}>{SU_PRIVACY}</p>
    </form>
  );
};

export default SignupForm;
