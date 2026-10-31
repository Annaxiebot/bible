/**
 * EmailSignIn.tsx — the email steps under the sign-in choices · 邮箱登录步骤 (ADR-0020)
 *
 * State lives in useEmailSignIn (owned by SignInChoices, whose row holds the
 * "用邮箱登录 · Sign in with email" toggle). Step "email": the address field +
 * "发送登录链接". Step "sent": "已发送，请查看邮箱" — said the same way whether
 * or not the address has an account — and the 6-digit code box (one-time-code
 * autofill, digits only) + "登录". Step "done": "已登录". Senior type floors
 * (ADR-0003 §15) from setupStrings; stl colour tokens.
 */
import React from 'react';
import { EMAIL_CODE_LENGTH } from '../../supabase/auth/emailSignIn';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../setup/setupStrings';
import type { EmailSignIn as EmailState } from './useEmailSignIn';
import {
  SI_EMAIL_LABEL, SI_EMAIL_PLACEHOLDER, SI_SEND, SI_SENDING, SI_SENT, SI_SENT_HOW, SI_CODE_LABEL,
  SI_VERIFY, SI_VERIFYING, SI_OTHER_EMAIL, SI_SIGNED_IN,
} from './signInStrings';

const textStyle: React.CSSProperties = { fontSize: SETUP_MIN_FONT_PX, lineHeight: 1.5 };
const controlStyle: React.CSSProperties = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };
const inputClass = 'min-w-0 flex-1 rounded-lg border border-stl-border bg-stl-bg px-4 text-stl-text focus:border-stl-gold focus:outline-none';
const submitClass = 'rounded-lg bg-stl-gold px-5 font-semibold text-stl-bg hover:bg-stl-gold-hover disabled:opacity-60';
const linkClass = 'self-start text-stl-text-2 underline underline-offset-4 hover:text-stl-text';

const Problem: React.FC<{ text: string | null }> = ({ text }) =>
  text ? <p role="alert" className="text-red-300" style={textStyle}>{text}</p> : null;

const EmailStep: React.FC<{ s: EmailState }> = ({ s }) => (
  <form data-testid="email-sign-in" className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); void s.send(); }} noValidate>
    <label className="flex flex-col gap-2">
      <span className="text-stl-text-2" style={textStyle}>{SI_EMAIL_LABEL}</span>
      <div className="flex flex-wrap gap-2">
        <input type="email" inputMode="email" autoComplete="email" value={s.email} placeholder={SI_EMAIL_PLACEHOLDER}
          onChange={e => s.setEmail(e.target.value)} aria-label={SI_EMAIL_LABEL} aria-invalid={s.error !== null}
          className={inputClass} style={controlStyle} data-testid="email-sign-in-address" />
        <button type="submit" disabled={s.busy} className={submitClass} style={controlStyle} data-testid="email-sign-in-send">
          {s.busy ? SI_SENDING : SI_SEND}
        </button>
      </div>
    </label>
    <Problem text={s.error} />
  </form>
);

const CodeStep: React.FC<{ s: EmailState }> = ({ s }) => (
  <form data-testid="email-sign-in-code-step" className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); void s.verify(); }} noValidate>
    <p role="status" className="text-stl-gold" style={textStyle}>{SI_SENT}</p>
    <p className="text-stl-text-2" style={textStyle}>{SI_SENT_HOW}</p>
    <label className="flex flex-col gap-2">
      <span className="text-stl-text-2" style={textStyle}>{SI_CODE_LABEL}</span>
      <div className="flex flex-wrap gap-2">
        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={EMAIL_CODE_LENGTH} value={s.code}
          onChange={e => s.setCode(e.target.value)} aria-label={SI_CODE_LABEL} aria-invalid={s.error !== null}
          className={`${inputClass} tracking-[0.3em]`} style={{ ...controlStyle, maxWidth: '12ch' }} data-testid="email-sign-in-code" />
        <button type="submit" disabled={s.busy} className={submitClass} style={controlStyle} data-testid="email-sign-in-verify">
          {s.busy ? SI_VERIFYING : SI_VERIFY}
        </button>
      </div>
    </label>
    <Problem text={s.error} />
    <button type="button" onClick={s.otherEmail} className={linkClass} style={controlStyle}>{SI_OTHER_EMAIL}</button>
  </form>
);

export const EmailSignInSteps: React.FC<{ s: EmailState }> = ({ s }) => {
  if (s.step === 'email') return <EmailStep s={s} />;
  if (s.step === 'sent') return <CodeStep s={s} />;
  if (s.step === 'done') return <p role="status" className="text-stl-gold" style={textStyle} data-testid="email-sign-in-done">{SI_SIGNED_IN}</p>;
  return null;
};
