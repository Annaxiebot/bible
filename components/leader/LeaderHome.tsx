/**
 * LeaderHome.tsx — "#/leader": everything of the leader's in one place · 带领者主页
 *
 * Owner decision (ADR-0006): one explicit leader sign-in, then all of that
 * leader's work on any device. Signed out → a sign-in line + the
 * identity-only Google button (useGoogleSignIn; the sign-in returns to
 * #/leader). Signed in → "我的查经包 My study packs" newest first, each with
 * its sign-up / shared-answer counts and Edit · Present · Sign-ups &
 * responses · Sign-up QR links (LeaderPackRow), a "新建查经 New study" link
 * and the pack sync line. Every failure renders inline (role=alert).
 * Under the packs, "全站使用 · Site-wide" totals (SiteStatsSection, ADR-0012).
 */
import React from 'react';
import { useGoogleSignIn } from '../signup/useGoogleSignIn';
import { SU_ERR_NOT_CONFIGURED, SU_SIGN_IN_GOOGLE, SU_SIGNING_IN } from '../signup/signupStrings';
import { NEW_STUDY_HASH, LANDING_HASH } from '../landing/landingRoute';
import { NEW_STUDY_LINE } from '../landing/landingStrings';
import { NS_NO_PACKS, NS_INVALID_RECORDS } from '../newstudy/newStudyStrings';
import { PackSyncLine } from '../newstudy/PackSyncLine';
import { useLeaderSession } from './useLeaderSession';
import { useLeaderPacks } from './leaderHomeData';
import { LeaderPackRow, primaryLinkClass } from './LeaderPackRow';
import { LH_TITLE, LH_SIGNIN, LH_LOADING, LD_BACK } from './leaderStrings';
import { LeaderSignOut } from './LeaderSignOut';
import SiteStatsSection from './SiteStatsSection';
import { textStyle, controlStyle, pageTitleStyle } from '../newstudy/newStudyStyles';

const alert = (text: string) => <p role="alert" className="text-red-300" style={textStyle}>{text}</p>;

const SignInPrompt: React.FC = () => {
  const { signIn, busy, error } = useGoogleSignIn();
  return (
    <div data-testid="lh-signin" className="flex flex-col items-start gap-4">
      <p className="text-stl-text" style={textStyle}>{LH_SIGNIN}</p>
      <button type="button" data-testid="lh-signin-button" onClick={() => void signIn()} disabled={busy}
        className="rounded-lg bg-stl-gold px-6 font-semibold text-stl-bg hover:bg-stl-gold-hover disabled:opacity-60" style={controlStyle}>
        {busy ? SU_SIGNING_IN : SU_SIGN_IN_GOOGLE}
      </button>
      {error && alert(error)}
    </div>
  );
};

const MyPacks: React.FC<{ uid: string }> = ({ uid }) => {
  const { packs, invalid, counts, error, countsError } = useLeaderPacks(uid);
  return (
    <section data-testid="lh-packs" className="flex flex-col gap-4">
      <a href={NEW_STUDY_HASH} data-testid="lh-new" className={`${primaryLinkClass} self-start`} style={controlStyle}>＋ {NEW_STUDY_LINE}</a>
      <PackSyncLine />
      {error && alert(error)}
      {countsError && alert(countsError)}
      {invalid.length > 0 && alert(`${NS_INVALID_RECORDS}: ${invalid.join(', ')}`)}
      {packs === null && <p className="text-stl-text-2" style={textStyle}>{LH_LOADING}</p>}
      {packs?.length === 0 && <p className="text-stl-text-2" style={textStyle}>{NS_NO_PACKS}</p>}
      {packs && packs.length > 0 && (
        <ul className="flex flex-col gap-3">
          {packs.map(p => (
            <LeaderPackRow key={p.id} pack={p} counts={counts ? (counts.get(p.id) ?? { signups: 0, answers: 0 }) : null} />
          ))}
        </ul>
      )}
    </section>
  );
};

const LeaderHome: React.FC = () => {
  const session = useLeaderSession();
  return (
    <div data-testid="leader-home" className="fixed inset-0 overflow-y-auto bg-stl-bg text-stl-text">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-bold text-stl-gold" style={pageTitleStyle}>{LH_TITLE}</h1>
            {session.uid && <LeaderSignOut email={session.email} />}
          </div>
          <a href={LANDING_HASH} className="rounded-lg px-4 text-stl-text-2 hover:text-stl-text" style={controlStyle} aria-label={LD_BACK}>✕</a>
        </header>
        {!session.configured && alert(SU_ERR_NOT_CONFIGURED)}
        {session.configured && !session.loading && !session.uid && <SignInPrompt />}
        {session.uid && <MyPacks uid={session.uid} />}
        {session.uid && <SiteStatsSection />}
      </div>
    </div>
  );
};

export default LeaderHome;
