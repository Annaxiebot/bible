/**
 * LandingLeaderLink.tsx — the nav's one context-aware leader control · 带领者入口
 *
 * Signed out → the gold "带领者登录 Leader sign-in" pill, a link to the leader
 * home (#/leader), which offers both ways in — Google or an email link/code
 * (SignInChoices, ADR-0020) — and keeps the leader there once signed in.
 * Signed in → the leader's first name (or email local part) as a pill link
 * to the same page (ADR-0006). ≥ 48px either way (.stl-pill-sm).
 */
import React from 'react';
import { useLeaderSession, leaderDisplayName } from '../leader/useLeaderSession';
import { LEADER_HOME_HASH } from '../leader/leaderRoute';
import { NAV_LEADER_SIGNIN } from './landingStrings';
import Pill from '../shared/Pill';

const SIGNIN_LABEL = `${NAV_LEADER_SIGNIN.zh} ${NAV_LEADER_SIGNIN.en}`;

const LandingLeaderLink: React.FC = () => {
  const session = useLeaderSession();
  if (session.uid) {
    return (
      <Pill small href={LEADER_HOME_HASH} testId="nav-leader"
        label={leaderDisplayName(session.name, session.email)} />
    );
  }
  return <Pill small href={LEADER_HOME_HASH} testId="nav-leader-signin" label={SIGNIN_LABEL} />;
};

export default LandingLeaderLink;
