/**
 * StopPage.tsx — "#/checkin/<signupId>/stop" · 停止提醒页 (ADR-0009)
 *
 * The page every check-in email's last line links to. No sign-in: the
 * signup uuid is the member's only credential, as on the check-in page.
 * One large "停止提醒 · Stop these emails" button → unsubscribe_signup →
 * "已停止本次查经的提醒 · Reminders for this study are stopped" with a
 * "恢复 · Resume" button (resubscribe_signup). CheckinSubscription is the
 * small version the check-in page shows: a link here while subscribed, the
 * stopped state with Resume once stopped. Every failure is a visible line.
 */
import React, { useState } from 'react';
import { getSignupClient } from '../signup/signupClient';
import { SU_ERR_NOT_CONFIGURED } from '../signup/signupStrings';
import { textStyle, controlStyle, headingStyle, pageTitleStyle } from '../newstudy/newStudyStyles';
import { setMemberSubscription } from './checkinClient';
import { checkinHash, checkinStopHash } from './checkinRoute';
import { CK_TITLE, CK_STOP, CK_STOP_BUSY, CK_STOPPED, CK_RESUME, CK_RESUMED } from './checkinStrings';

type Phase = 'subscribed' | 'stopped' | 'resumed';

interface Subscription {
  phase: Phase;
  busy: boolean;
  error: string | null;
  set: (stop: boolean) => Promise<void>;
}

/** Stop/resume state for one token; `initial` comes from checkin_context (or 'subscribed' on the stop page). */
export function useMemberSubscription(signupId: string, initial: Phase): Subscription {
  const [phase, setPhase] = useState<Phase>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = async (stop: boolean) => {
    const client = getSignupClient();
    if (!client) { setError(SU_ERR_NOT_CONFIGURED); return; }
    setBusy(true);
    try {
      await setMemberSubscription(client, signupId, stop);
      setError(null);
      setPhase(stop ? 'stopped' : 'resumed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return { phase, busy, error, set };
}

const bigButton = 'w-full rounded-lg bg-stl-gold px-8 py-4 font-semibold text-stl-bg hover:bg-stl-gold-hover disabled:opacity-60';
const plainButton = 'rounded-lg border border-stl-border px-6 text-stl-text hover:border-stl-gold disabled:opacity-60';

const ErrorLine: React.FC<{ error: string | null }> = ({ error }) =>
  error ? <p role="alert" className="text-red-300" style={textStyle}>{error}</p> : null;

const StopPage: React.FC<{ signupId: string }> = ({ signupId }) => {
  const sub = useMemberSubscription(signupId, 'subscribed');
  const stopped = sub.phase === 'stopped';
  return (
    <div data-testid="stop-page" className="fixed inset-0 overflow-y-auto bg-stl-bg text-stl-text">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="font-bold text-stl-gold" style={pageTitleStyle}>{CK_TITLE}</h1>
        {stopped ? (
          <>
            <p role="status" data-testid="stop-done" className="font-semibold text-stl-text" style={headingStyle}>{CK_STOPPED}</p>
            <button type="button" data-testid="stop-resume" disabled={sub.busy} onClick={() => void sub.set(false)}
              className={plainButton} style={controlStyle}>{sub.busy ? CK_STOP_BUSY : CK_RESUME}</button>
          </>
        ) : (
          <>
            {sub.phase === 'resumed' && <p role="status" data-testid="stop-resumed" className="text-stl-text-2" style={textStyle}>{CK_RESUMED}</p>}
            <button type="button" data-testid="stop-button" disabled={sub.busy} onClick={() => void sub.set(true)}
              className={bigButton} style={headingStyle}>{sub.busy ? CK_STOP_BUSY : CK_STOP}</button>
          </>
        )}
        <ErrorLine error={sub.error} />
        <a href={checkinHash(signupId)} className="text-stl-text-2 underline underline-offset-4" style={textStyle}>← {CK_TITLE}</a>
      </div>
    </div>
  );
};

/** The check-in page's footer: a small link to the stop page, or — once stopped — the state with Resume. */
export const CheckinSubscription: React.FC<{ signupId: string; stopped: boolean }> = ({ signupId, stopped }) => {
  const sub = useMemberSubscription(signupId, stopped ? 'stopped' : 'subscribed');
  if (sub.phase !== 'stopped') {
    return (
      <a href={checkinStopHash(signupId)} data-testid="checkin-stop-link"
        className="text-stl-text-3 underline underline-offset-4" style={textStyle}>{CK_STOP}</a>
    );
  }
  return (
    <div data-testid="checkin-stopped" className="flex flex-wrap items-center gap-3">
      <p className="text-stl-text-2" style={textStyle}>{CK_STOPPED}</p>
      <button type="button" data-testid="checkin-resume" disabled={sub.busy} onClick={() => void sub.set(false)}
        className={plainButton} style={controlStyle}>{sub.busy ? CK_STOP_BUSY : CK_RESUME}</button>
      <ErrorLine error={sub.error} />
    </div>
  );
};

export default StopPage;
