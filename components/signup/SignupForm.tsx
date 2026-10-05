/**
 * SignupForm.tsx — the two-step sign-up · 报名表单
 *
 * Step 1 (PracticeStep): the commitment — any number of life-menu
 * practices (at least one), an optional own version; Next is gated on a choice.
 * Step 2: name (required), email (required — the check-in channel), phone (optional, with the
 * SMS-not-yet hint), consent (default on). Large type and ≥48px targets
 * from newStudyStyles (ADR-0003 §15); paper style and gold pills (shared/). Validation and submit errors render
 * inline (role=alert); the parent owns the insert.
 */
import React, { useState } from 'react';
import type { LifeMenuRow } from '../studypack/packTypes';
import { SignupForm as SignupFormValues, EMPTY_SIGNUP, validateSignup, validatePractice, practiceLines, ownVersionOf } from './signupClient';
import PracticeStep from './PracticeStep';
import {
  SU_NAME, SU_PHONE, SU_PHONE_HINT, SU_EMAIL, SU_CONSENT, SU_SUBMIT, SU_SUBMITTING, SU_PRIVACY,
  SU_NEXT_STEP, SU_PREV_STEP, SU_CONTACT_TITLE, commitmentLine,
} from './signupStrings';
import { textStyle, controlStyle, headingStyle } from '../newstudy/newStudyStyles';
import {
  PAPER_HEAD_CLASS, PAPER_MUTED_CLASS, PAPER_ACCENT_CLASS, PAPER_ERROR_CLASS, PAPER_INPUT_CLASS, PAPER_LABEL_CLASS,
} from '../shared/paperStyles';
import Pill from '../shared/Pill';

export { EMPTY_SIGNUP };

interface Props {
  /** The pack's life menu: the practices to choose from. */
  rows: LifeMenuRow[];
  /** Resolves when the row is stored; rejects with a bilingual Error to show. */
  onSubmit: (form: SignupFormValues) => Promise<void>;
}

const checkboxStyle: React.CSSProperties = { width: 28, height: 28, accentColor: 'var(--stl-gold-deep)' };

const ContactFields: React.FC<{ form: SignupFormValues; set: (patch: Partial<SignupFormValues>) => void }> = ({ form, set }) => (
  <>
    <label className={PAPER_LABEL_CLASS} style={textStyle}>
      <span>{SU_NAME}</span>
      <input data-testid="su-name" className={PAPER_INPUT_CLASS} style={controlStyle} autoComplete="name"
        value={form.name} onChange={e => set({ name: e.target.value })} />
    </label>
    <label className={PAPER_LABEL_CLASS} style={textStyle}>
      <span>{SU_EMAIL}</span>
      <input data-testid="su-email" className={PAPER_INPUT_CLASS} style={controlStyle} type="email" inputMode="email" autoComplete="email" required
        value={form.email} onChange={e => set({ email: e.target.value })} />
    </label>
    <label className={PAPER_LABEL_CLASS} style={textStyle}>
      <span>{SU_PHONE}</span>
      <input data-testid="su-phone" className={PAPER_INPUT_CLASS} style={controlStyle} type="tel" inputMode="tel" autoComplete="tel"
        value={form.phone} onChange={e => set({ phone: e.target.value })} />
      <span className={PAPER_MUTED_CLASS}>{SU_PHONE_HINT}</span>
    </label>
    <label className="flex items-center gap-3 text-stl-ink" style={controlStyle}>
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
          <Pill testId="su-next" onClick={next} label={SU_NEXT_STEP} className="self-start" />
        </>
      ) : (
        <>
          {practiceLines(form).map((line, i) => (
            <p key={i} data-testid="su-commitment" className={PAPER_ACCENT_CLASS} style={textStyle}>{commitmentLine(line)}</p>
          ))}
          {ownVersionOf(form) && <p data-testid="su-own-version" className={PAPER_ACCENT_CLASS} style={textStyle}>{ownVersionOf(form)}</p>}
          <h2 className={PAPER_HEAD_CLASS} style={headingStyle}>{SU_CONTACT_TITLE}</h2>
          <ContactFields form={form} set={set} />
          <div className="flex flex-wrap gap-3">
            <Pill ghost testId="su-prev" onClick={() => setStep('practice')} label={SU_PREV_STEP} />
            <Pill type="submit" testId="su-submit" disabled={busy} label={busy ? SU_SUBMITTING : SU_SUBMIT} />
          </div>
        </>
      )}
      {error && <p role="alert" className={PAPER_ERROR_CLASS} style={textStyle}>{error}</p>}
      <p className={PAPER_MUTED_CLASS} style={textStyle}>{SU_PRIVACY}</p>
    </form>
  );
};

export default SignupForm;
