/**
 * LeaderPage.tsx — "#/leader/<packId>" · 组长名单页
 *
 * Owner view, top to bottom: the count, 反馈 Shared feedback first (the
 * part a leader comes to read, LeaderFeedback), the actions + pause, the
 * sign-up table (LeaderSignupTable), 承诺 Commitments, then the leader's
 * own 问一问记录 Ask AI history (LeaderAskHistory, ADR-0021).
 * Auth required: the leader session (useLeaderSession — the app's Supabase
 * session, or the dev-only __LEADER_E2E__ seam; data through getSignupClient,
 * which is the app's client in production) and, when signed out, renders the existing AuthPanel under a
 * bilingual prompt. Signed in as the pack's owner (pack.leaderId = uid): the
 * pack's sign-ups (name, phone, email, consent, time), a count, 承诺
 * Commitments and 反馈 Shared feedback (LeaderSections), CSV export with
 * practice + answers, and a dry-run test check-in to the leader's own
 * email; opening the page also refreshes the pack's pack_summaries row.
 * Each row can stop/resume that member's reminders and the study can be
 * paused (LeaderOptOut, ADR-0009).
 * A demo pack or someone else's pack shows a bilingual line instead
 * (ADR-0004); an unclaimed local pack is re-read once the sign-in claims it.
 * Every failure renders inline (role=alert).
 */
import React, { useEffect, useState } from 'react';
import { authManager } from '../../services/supabase';
import { getSignupClient } from '../signup/signupClient';
import { useLeaderSession } from './useLeaderSession';
import { AuthPanel } from '../AuthPanel';
import { loadPack } from '../studypack/packSource';
import type { StudyPack } from '../studypack/packTypes';
import { downloadFile } from '../../services/export/fileDownloader';
import { SU_ERR_NOT_CONFIGURED, SU_DEMO_LINE } from '../signup/signupStrings';
import { NEW_STUDY_HASH } from '../landing/landingRoute';
import { useSummarySync } from '../signup/useSummarySync';
import { useLocalPackClaim } from '../newstudy/claimLocalPacks';
import {
  SignupRecord, AnswerRecord, fetchSignups, fetchAnswers, foldReplaced, signupsToCsv, csvFilename, sendTestCheckin,
} from './leaderData';
import { Commitments } from './LeaderSections';
import { Feedback } from './LeaderFeedback';
import { SignupTable } from './LeaderSignupTable';
import { PauseToggle } from './LeaderOptOut';
import { AskHistorySection } from './LeaderAskHistory';
import {
  LD_TITLE, LD_SIGNIN, LD_LOADING, LD_NONE, LD_NOT_OWNER, countLine,
  LD_EXPORT, LD_TEST, LD_TEST_SENDING, LD_TEST_OK, LD_TEST_NO_EMAIL, LD_BACK,
} from './leaderStrings';
import {
  textStyle, controlStyle, headingStyle, pageTitleStyle, secondaryButtonClass, quietButtonClass,
} from '../newstudy/newStudyStyles';

type Rows =
  | { status: 'loading' }
  | { status: 'ready'; rows: SignupRecord[]; answers: AnswerRecord[] }
  | { status: 'failed'; message: string };

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

function useSignups(packId: string, leaderId: string): Rows {
  const [rows, setRows] = useState<Rows>({ status: 'loading' });
  useEffect(() => {
    const client = getSignupClient();
    if (!client) return;
    let cancelled = false;
    Promise.all([fetchSignups(client, packId, leaderId), fetchAnswers(client, packId, leaderId)])
      .then(([list, answers]) => { if (!cancelled) setRows({ status: 'ready', ...foldReplaced(list, answers) }); })
      .catch((err: unknown) => { if (!cancelled) setRows({ status: 'failed', message: describe(err) }); });
    return () => { cancelled = true; };
  }, [packId, leaderId]);
  return rows;
}

const TestButton: React.FC<{ pack: StudyPack | null }> = ({ pack }) => {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    const email = authManager.getEmail();
    if (!email) { setLine({ ok: false, text: LD_TEST_NO_EMAIL }); return; }
    const client = getSignupClient();
    if (!pack || !client) return;
    setBusy(true);
    try {
      await sendTestCheckin(client, pack, email, authManager.getFullName() ?? email);
      setLine({ ok: true, text: LD_TEST_OK });
    } catch (err) {
      setLine({ ok: false, text: describe(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" data-testid="leader-test" disabled={busy || !pack} onClick={() => void run()}
        className={secondaryButtonClass} style={controlStyle}>
        {busy ? LD_TEST_SENDING : LD_TEST}
      </button>
      {line && <p role={line.ok ? 'status' : 'alert'} className={line.ok ? 'text-emerald-300' : 'text-red-300'} style={textStyle}>{line.text}</p>}
    </>
  );
};

/** The owner's list: rows scoped to this leader's uid (RLS + client filter). */
const OwnerView: React.FC<{ pack: StudyPack; leaderId: string }> = ({ pack, leaderId }) => {
  const rows = useSignups(pack.id, leaderId);
  const summary = useSummarySync(pack);
  if (rows.status === 'loading') return <p className="text-stl-text-2" style={textStyle}>{LD_LOADING}</p>;
  if (rows.status === 'failed') return <p role="alert" className="text-red-300" style={textStyle}>{rows.message}</p>;
  return (
    <>
      {summary.status === 'failed' && <p role="alert" data-testid="summary-failed" className="text-red-300" style={textStyle}>{summary.message}</p>}
      <p data-testid="leader-count" className="font-semibold text-stl-text" style={headingStyle}>{countLine(rows.rows.length)}</p>
      {rows.rows.length > 0 && <Feedback rows={rows.rows} answers={rows.answers} />}
      <div className="flex flex-wrap gap-3">
        <button type="button" data-testid="leader-export" disabled={rows.rows.length === 0}
          onClick={() => downloadFile(signupsToCsv(rows.rows, rows.answers), csvFilename(pack.id), 'text/csv;charset=utf-8')}
          className={secondaryButtonClass} style={controlStyle}>
          {LD_EXPORT}
        </button>
        <TestButton pack={pack} />
      </div>
      <PauseToggle packId={pack.id} leaderId={leaderId} />
      {rows.rows.length === 0 ? <p className="text-stl-text-2" style={textStyle}>{LD_NONE}</p> : <SignupTable rows={rows.rows} />}
      {rows.rows.length > 0 && <Commitments rows={rows.rows} />}
      <AskHistorySection packId={pack.id} leaderId={leaderId} />
    </>
  );
};

/** Signed in: demo pack → demo line; someone else's pack → not-owner line; own pack → the list. */
const SignedInView: React.FC<{ pack: StudyPack | null; uid: string }> = ({ pack, uid }) => {
  if (!pack) return null;
  if (!pack.leaderId) return <p data-testid="leader-demo" className="text-stl-text-2" style={textStyle}>{SU_DEMO_LINE}</p>;
  if (pack.leaderId !== uid) return <p data-testid="leader-not-owner" role="alert" className="text-red-300" style={textStyle}>{LD_NOT_OWNER}</p>;
  return <OwnerView pack={pack} leaderId={uid} />;
};

const LeaderPage: React.FC<{ packId: string }> = ({ packId }) => {
  const session = useLeaderSession();
  const claim = useLocalPackClaim(packId);
  const [pack, setPack] = useState<StudyPack | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPack(packId)
      .then(p => { if (!cancelled) setPack(p); })
      .catch((err: unknown) => { if (!cancelled) setPackError(describe(err)); });
    return () => { cancelled = true; };
  }, [packId, claim.version]);

  return (
    <div data-testid="leader-page" className="fixed inset-0 overflow-y-auto bg-stl-bg text-stl-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-bold text-stl-gold" style={pageTitleStyle}>{LD_TITLE}</h1>
            <p className="mt-2 text-stl-text-2" style={textStyle}>{pack ? pack.title : packId}</p>
            {packError && <p role="alert" className="text-red-300" style={textStyle}>{packError}</p>}
            {claim.failure && <p role="alert" className="text-red-300" style={textStyle}>{claim.failure}</p>}
          </div>
          <a href={NEW_STUDY_HASH} className={quietButtonClass} style={controlStyle} aria-label={LD_BACK}>✕</a>
        </header>
        {!session.configured && <p role="alert" className="text-red-300" style={textStyle}>{SU_ERR_NOT_CONFIGURED}</p>}
        {session.configured && !session.loading && !session.uid && (
          <div data-testid="leader-signin">
            <p className="mb-4 text-stl-text" style={textStyle}>{LD_SIGNIN}</p>
            <AuthPanel />
          </div>
        )}
        {session.uid && <SignedInView pack={pack} uid={session.uid} />}
      </div>
    </div>
  );
};

export default LeaderPage;
