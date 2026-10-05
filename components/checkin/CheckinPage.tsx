/**
 * CheckinPage.tsx — "#/checkin/<signupId>[/<kind>]" · 周中跟进页
 *
 * The page a member opens from a check-in message. Shows every committed
 * practice (each its own text; the own version as an extra line) and the pack's question for the kind, one short answer field,
 * and two choices: keep it on this device (localStorage, no network) or
 * share it with the leader (share_checkin_answer RPC). Private by default
 * (ADR-0003 §17): nothing leaves the phone unless the member taps Share.
 * Every failure is a visible state. A small "停止提醒 · Stop these emails"
 * link goes to the stop page; a stopped member sees that state with Resume
 * (CheckinSubscription, ADR-0009). Paper style like the landing
 * (shared/paperStyles): WenKai heading, sans body, gold pills.
 */
import React, { useEffect, useState } from 'react';
import { getSignupClient } from '../signup/signupClient';
import { SU_ERR_NOT_CONFIGURED } from '../signup/signupStrings';
import { textStyle, headingStyle, pageTitleStyle } from '../newstudy/newStudyStyles';
import {
  PAPER_PAGE_CLASS, PAPER_COLUMN_CLASS, PAPER_HEAD_CLASS, PAPER_MUTED_CLASS, PAPER_ACCENT_CLASS, PAPER_ERROR_CLASS, PAPER_OK_CLASS,
  PAPER_INPUT_CLASS, PAPER_LABEL_CLASS,
} from '../shared/paperStyles';
import Pill from '../shared/Pill';
import type { CheckinKind } from './checkinRoute';
import { CheckinSubscription } from './StopPage';
import {
  CheckinContext, fetchCheckinContext, shareAnswer, readPrivateAnswer, keepPrivateAnswer, promptFor, kindForToday,
} from './checkinClient';
import { practiceItems, ownVersionLine } from '../../supabase/functions/send-checkins/practices';
import {
  CK_TITLE, CK_LOADING, CK_PRACTICE_LABEL, CK_QUESTION_LABEL, CK_ANSWER, CK_KEEP_PRIVATE, CK_SHARE, CK_SHARING, CK_KEPT,
  CK_SHARED, CK_ERR_EMPTY, CK_PRIVACY, CK_KIND_LABEL,
} from './checkinStrings';

type ContextState =
  | { status: 'loading' }
  | { status: 'ready'; context: CheckinContext }
  | { status: 'failed'; message: string };

function useCheckinContext(signupId: string): ContextState {
  const [state, setState] = useState<ContextState>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    const client = getSignupClient();
    if (!client) { setState({ status: 'failed', message: SU_ERR_NOT_CONFIGURED }); return; }
    fetchCheckinContext(client, signupId)
      .then(context => { if (!cancelled) setState({ status: 'ready', context }); })
      .catch((err: unknown) => { if (!cancelled) setState({ status: 'failed', message: err instanceof Error ? err.message : String(err) }); });
    return () => { cancelled = true; };
  }, [signupId]);
  return state;
}

type Done = { kind: 'kept' } | { kind: 'shared' };

const AnswerForm: React.FC<{ signupId: string; kind: CheckinKind; context: CheckinContext }> = ({ signupId, kind, context }) => {
  const [answer, setAnswer] = useState(() => readPrivateAnswer(signupId, kind));
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const keep = () => {
    if (!answer.trim()) { setError(CK_ERR_EMPTY); return; }
    keepPrivateAnswer(signupId, kind, answer.trim());
    setError(null);
    setDone({ kind: 'kept' });
  };

  const share = async () => {
    if (!answer.trim()) { setError(CK_ERR_EMPTY); return; }
    const client = getSignupClient();
    if (!client) { setError(SU_ERR_NOT_CONFIGURED); return; }
    setBusy(true);
    try {
      await shareAnswer(client, signupId, kind, answer.trim());
      setError(null);
      setDone({ kind: 'shared' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="checkin-form" className="flex flex-col gap-5">
      <div data-testid="checkin-practice">
        <p className={PAPER_MUTED_CLASS} style={textStyle}>{CK_PRACTICE_LABEL}</p>
        {practiceItems(context).map((item, i) => (
          <div key={i} data-testid="checkin-practice-item" className="mt-2">
            <p className={`font-semibold ${PAPER_ACCENT_CLASS}`} style={headingStyle}>{item.text}</p>
            {item.area && <p className={PAPER_MUTED_CLASS} style={textStyle}>{item.area}</p>}
          </div>
        ))}
        {ownVersionLine(context) && (
          <p data-testid="checkin-own-version" className={`mt-2 font-semibold ${PAPER_ACCENT_CLASS}`} style={headingStyle}>{ownVersionLine(context)}</p>
        )}
      </div>
      <div data-testid="checkin-question">
        <p className={PAPER_MUTED_CLASS} style={textStyle}>{CK_QUESTION_LABEL} · {CK_KIND_LABEL[kind]}</p>
        <p className="text-stl-ink" style={headingStyle}>{promptFor(context, kind)}</p>
      </div>
      <label className={PAPER_LABEL_CLASS} style={textStyle}>
        <span>{CK_ANSWER}</span>
        <textarea data-testid="checkin-answer" rows={4} value={answer} onChange={e => { setAnswer(e.target.value); setDone(null); }}
          className={PAPER_INPUT_CLASS} style={textStyle} />
      </label>
      <div className="flex flex-wrap gap-3">
        <Pill ghost testId="checkin-keep" onClick={keep} label={CK_KEEP_PRIVATE} />
        <Pill testId="checkin-share" onClick={() => void share()} disabled={busy} label={busy ? CK_SHARING : CK_SHARE} />
      </div>
      {error && <p role="alert" className={PAPER_ERROR_CLASS} style={textStyle}>{error}</p>}
      {done && (
        <p role="status" data-testid="checkin-done" className={PAPER_OK_CLASS} style={textStyle}>
          {done.kind === 'kept' ? CK_KEPT : CK_SHARED}
        </p>
      )}
      <p className={PAPER_MUTED_CLASS} style={textStyle}>{CK_PRIVACY}</p>
    </div>
  );
};

const CheckinPage: React.FC<{ signupId: string; kind: CheckinKind | null }> = ({ signupId, kind }) => {
  const state = useCheckinContext(signupId);
  const resolvedKind = kind ?? kindForToday();
  return (
    <div data-testid="checkin-page" className={PAPER_PAGE_CLASS}>
      <div className={PAPER_COLUMN_CLASS}>
        <header>
          <h1 className={PAPER_HEAD_CLASS} style={pageTitleStyle}>{CK_TITLE}</h1>
          {state.status === 'ready' && <p className={`mt-2 ${PAPER_MUTED_CLASS}`} style={textStyle}>{state.context.pack_title}</p>}
        </header>
        {state.status === 'loading' && <p className={PAPER_MUTED_CLASS} style={textStyle}>{CK_LOADING}</p>}
        {state.status === 'failed' && <p role="alert" className={PAPER_ERROR_CLASS} style={textStyle}>{state.message}</p>}
        {state.status === 'ready' && <AnswerForm signupId={signupId} kind={resolvedKind} context={state.context} />}
        {state.status === 'ready' && <CheckinSubscription signupId={signupId} stopped={!!state.context.unsubscribed_at} />}
      </div>
    </div>
  );
};

export default CheckinPage;
