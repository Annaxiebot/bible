/**
 * LandingLeaderLink.tsx — the nav's one context-aware leader control · 带领者入口
 *
 * Signed out → the gold "带领者登录 Leader sign-in" pill, a button that starts
 * the identity-only Google sign-in (useGoogleSignIn, the same hook as every
 * other sign-in button) and comes back to the leader home (#/leader), not
 * the landing it started on; an auth error renders under it. Signed in → the
 * leader's first name (or email local part) as a pill link to the leader
 * home (#/leader, ADR-0006). ≥ 48px either way (.stl-pill-sm).
 */
import React from 'react';
import { useGoogleSignIn } from '../signup/useGoogleSignIn';
import { SU_SIGNING_IN } from '../signup/signupStrings';
import { useLeaderSession, leaderDisplayName } from '../leader/useLeaderSession';
import { LEADER_HOME_HASH } from '../leader/leaderRoute';
import { NAV_LEADER_SIGNIN } from './landingStrings';
import { SETUP_MIN_FONT_PX } from '../setup/setupStrings';
import Pill from '../shared/Pill';

const SIGNIN_LABEL = `${NAV_LEADER_SIGNIN.zh} ${NAV_LEADER_SIGNIN.en}`;

const LandingLeaderLink: React.FC = () => {
  const session = useLeaderSession();
  const { signIn, busy, error } = useGoogleSignIn(LEADER_HOME_HASH);
  if (session.uid) {
    return (
      <Pill small href={LEADER_HOME_HASH} testId="nav-leader"
        label={leaderDisplayName(session.name, session.email)} />
    );
  }
  return (
    <>
      <Pill small testId="nav-leader-signin" onClick={() => void signIn()}
        disabled={busy || session.loading} label={busy ? SU_SIGNING_IN : SIGNIN_LABEL} />
      {error && (
        <p role="alert" data-testid="nav-leader-error" className="ld-nav-error text-red-700" style={{ fontSize: SETUP_MIN_FONT_PX }}>
          {error}
        </p>
      )}
    </>
  );
};

export default LandingLeaderLink;
