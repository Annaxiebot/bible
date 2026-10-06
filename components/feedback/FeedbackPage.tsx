/**
 * FeedbackPage.tsx — "#/feedback" · 意见反馈页 (ADR-0011)
 *
 * Public, no sign-in. A textarea (≤ 2000 chars), an optional reply email,
 * a hidden honeypot, and the Send pill; success shows the thank-you line,
 * every failure its own typed line (feedbackStrings FB_ERRORS). The context
 * from the link (?from=…&pack=…) arrives as a prop, is shown nowhere and
 * goes with the message. Validation is the shared validateFeedback (the
 * function repeats it before any write). The owner's address never reaches
 * the browser: the function emails it from a secret. Paper style with the
 * shared PaperHeader (its feedback link hidden here — this is the page).
 */
import React, { useState } from 'react';
import { getSignupClient } from '../signup/signupClient';
import { textStyle, controlStyle, pageTitleStyle } from '../newstudy/newStudyStyles';
import {
  PAPER_PAGE_CLASS, PAPER_COLUMN_CLASS, PAPER_HEAD_CLASS, PAPER_ERROR_CLASS, PAPER_INPUT_CLASS, PAPER_LABEL_CLASS, PAPER_MUTED_CLASS,
} from '../shared/paperStyles';
import Pill from '../shared/Pill';
import PaperHeader from '../shared/PaperHeader';
import {
  FEEDBACK_LABEL, FEEDBACK_MAX_CHARS, FEEDBACK_EMAIL_MAX_CHARS, HONEYPOT_FIELD, FeedbackContext, validateFeedback,
} from '../../supabase/functions/_shared/feedback';
import { sendFeedback } from './feedbackClient';
import { FB_MESSAGE_LABEL, FB_EMAIL_LABEL, FB_SEND, FB_SENDING, FB_THANKS, FB_ERRORS, FeedbackFailure } from './feedbackStrings';

export const FEEDBACK_PAGE_TEST_ID = 'feedback-page';
const TEXTAREA_ROWS = 6;
/** Off-screen, out of the tab order and hidden from screen readers: only a bot fills it. */
const HONEYPOT_CLASS = 'absolute -left-[9999px] h-px w-px overflow-hidden';

/** The form's state and its one submit: shared validation, then the function call. */
function useFeedbackForm(context: FeedbackContext) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [trap, setTrap] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FeedbackFailure | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = { message, email, [HONEYPOT_FIELD]: trap, context };
    const verdict = validateFeedback(payload);
    if (verdict.ok === false) { setFailure(verdict.problem); return; }
    const client = getSignupClient();
    if (!client) { setFailure('not-configured'); return; }
    setBusy(true);
    const result = await sendFeedback(client, payload);
    setBusy(false);
    if (result.ok === false) setFailure(result.failure); else { setSent(true); setFailure(null); }
  };
  return { message, setMessage, email, setEmail, trap, setTrap, busy, failure, sent, submit };
}

const FeedbackPage: React.FC<{ context: FeedbackContext }> = ({ context }) => {
  const { message, setMessage, email, setEmail, trap, setTrap, busy, failure, sent, submit } = useFeedbackForm(context);
  return (
    <div data-testid={FEEDBACK_PAGE_TEST_ID} className={PAPER_PAGE_CLASS}>
      <div className={PAPER_COLUMN_CLASS}>
        <PaperHeader feedbackLink={false} />
        <h1 className={PAPER_HEAD_CLASS} style={pageTitleStyle}>{FEEDBACK_LABEL}</h1>
        {sent ? (
          <p role="status" data-testid="feedback-thanks" className="font-semibold text-stl-ink" style={textStyle}>{FB_THANKS}</p>
        ) : (
          <form onSubmit={e => void submit(e)} noValidate className="relative flex flex-col gap-5">
            <div className="flex flex-col gap-1">
              <label className={PAPER_LABEL_CLASS} style={textStyle}>
                {FB_MESSAGE_LABEL}
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={TEXTAREA_ROWS}
                  maxLength={FEEDBACK_MAX_CHARS} data-testid="feedback-message" className={PAPER_INPUT_CLASS} style={textStyle} />
              </label>
              <span className={`self-end ${PAPER_MUTED_CLASS}`}>{message.length} / {FEEDBACK_MAX_CHARS}</span>
            </div>
            <label className={PAPER_LABEL_CLASS} style={textStyle}>
              {FB_EMAIL_LABEL}
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"
                maxLength={FEEDBACK_EMAIL_MAX_CHARS} data-testid="feedback-email" className={PAPER_INPUT_CLASS} style={controlStyle} />
            </label>
            <div aria-hidden="true" className={HONEYPOT_CLASS}>
              <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" value={trap}
                onChange={e => setTrap(e.target.value)} data-testid="feedback-honeypot" />
            </div>
            <Pill type="submit" testId="feedback-send" disabled={busy} label={busy ? FB_SENDING : FB_SEND} className="self-start" />
            {failure && <p role="alert" data-testid="feedback-error" className={PAPER_ERROR_CLASS} style={textStyle}>{FB_ERRORS[failure]}</p>}
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackPage;
