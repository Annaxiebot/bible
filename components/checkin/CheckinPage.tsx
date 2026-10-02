/**
 * CheckinPage.tsx — "#/checkin/<signupId>[/<kind>]" · 周中跟进页
 *
 * The page a member opens from a check-in message. Shows the committed
 * practice and the pack's question for the kind, one short answer field,
 * and two choices: keep it on this device (localStorage, no network) or
 * share it with the leader (share_checkin_answer RPC). Private by default
 * (ADR-0003 §17): nothing leaves the phone unless the member taps Share.
 * Every failure is a visible state.
 */
import React, { useEffect, useState } from 'react';
import { getSignupClient } from '../signup/signupClient';
import { SU_ERR_NOT_CONFIGURED } from '../signup/signupStrings';
import { textStyle, controlStyle, headingStyle, pageTitleStyle, primaryButtonClass, secondaryButtonClass, inputClass } from '../newstudy/newStudyStyles';
import type { CheckinKind } from './checkinRoute';
import {
  CheckinContext, fetchCheckinContext, shareAnswer, readPrivateAnswer, keepPrivateAnswer, promptFor, practiceOf, kindForToday,
} from './checkinClient';
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
        <p className="text-slate-400" style={textStyle}>{CK_PRACTICE_LABEL}</p>
        <p className="font-semibold text-amber-300" style={headingStyle}>{practiceOf(context)}</p>
        {context.practice_area && <p className="text-slate-400" style={textStyle}>{context.practice_area}</p>}
      </div>
      <div data-testid="checkin-question">
        <p className="text-slate-400" style={textStyle}>{CK_QUESTION_LABEL} · {CK_KIND_LABEL[kind]}</p>
        <p className="text-slate-100" style={headingStyle}>{promptFor(context, kind)}</p>
      </div>
      <label className="flex flex-col gap-2 text-slate-400" style={textStyle}>
        <span>{CK_ANSWER}</span>
        <textarea data-testid="checkin-answer" rows={4} value={answer} onChange={e => { setAnswer(e.target.value); setDone(null); }}
          className={inputClass} style={textStyle} />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" data-testid="checkin-keep" onClick={keep} className={secondaryButtonClass} style={controlStyle}>
          {CK_KEEP_PRIVATE}
        </button>
        <button type="button" data-testid="checkin-share" onClick={() => void share()} disabled={busy}
          className={primaryButtonClass} style={controlStyle}>
          {busy ? CK_SHARING : CK_SHARE}
        </button>
      </div>
      {error && <p role="alert" className="text-red-300" style={textStyle}>{error}</p>}
      {done && (
        <p role="status" data-testid="checkin-done" className="text-emerald-300" style={textStyle}>
          {done.kind === 'kept' ? CK_KEPT : CK_SHARED}
        </p>
      )}
      <p className="text-slate-500" style={textStyle}>{CK_PRIVACY}</p>
    </div>
  );
};

const CheckinPage: React.FC<{ signupId: string; kind: CheckinKind | null }> = ({ signupId, kind }) => {
  const state = useCheckinContext(signupId);
  const resolvedKind = kind ?? kindForToday();
  return (
    <div data-testid="checkin-page" className="fixed inset-0 overflow-y-auto bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="font-bold text-amber-300" style={pageTitleStyle}>{CK_TITLE}</h1>
          {state.status === 'ready' && <p className="mt-2 text-slate-300" style={textStyle}>{state.context.pack_title}</p>}
        </header>
        {state.status === 'loading' && <p className="text-slate-400" style={textStyle}>{CK_LOADING}</p>}
        {state.status === 'failed' && <p role="alert" className="text-red-300" style={textStyle}>{state.message}</p>}
        {state.status === 'ready' && <AnswerForm signupId={signupId} kind={resolvedKind} context={state.context} />}
      </div>
    </div>
  );
};

export default CheckinPage;
