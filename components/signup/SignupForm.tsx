/**
 * SignupForm.tsx — the four-field sign-up form · 报名表单
 *
 * Name (required), phone (optional, with the SMS-not-yet hint), email
 * (recommended), consent (default on). Large type and ≥48px targets from
 * newStudyStyles (ADR-0003 §15). Validation and submit errors render inline
 * under the button (role=alert); the parent owns the insert.
 */
import React, { useState } from 'react';
import { SignupForm as SignupFormValues, validateSignup } from './signupClient';
import {
  SU_NAME, SU_PHONE, SU_PHONE_HINT, SU_EMAIL, SU_CONSENT, SU_SUBMIT, SU_SUBMITTING, SU_PRIVACY,
} from './signupStrings';
import { textStyle, controlStyle, inputClass, primaryButtonClass, labelClass } from '../newstudy/newStudyStyles';

export const EMPTY_SIGNUP: SignupFormValues = { name: '', phone: '', email: '', consent: true };

interface Props {
  /** Resolves when the row is stored; rejects with a bilingual Error to show. */
  onSubmit: (form: SignupFormValues) => Promise<void>;
}

const checkboxStyle: React.CSSProperties = { width: 28, height: 28, accentColor: '#f59e0b' };

const SignupForm: React.FC<Props> = ({ onSubmit }) => {
  const [form, setForm] = useState<SignupFormValues>(EMPTY_SIGNUP);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SignupFormValues>) => setForm(f => ({ ...f, ...patch }));

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
    <form data-testid="signup-form" onSubmit={submit} noValidate className="flex flex-col gap-5">
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
      <button type="submit" data-testid="su-submit" disabled={busy} className={primaryButtonClass} style={controlStyle}>
        {busy ? SU_SUBMITTING : SU_SUBMIT}
      </button>
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      <p className="text-slate-500" style={textStyle}>{SU_PRIVACY}</p>
    </form>
  );
};

export default SignupForm;
