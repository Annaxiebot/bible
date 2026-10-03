/**
 * LandingLeaderLink.tsx — the nav's one context-aware leader control · 带领者入口
 *
 * Signed out → "带领者登录 Leader sign-in", a button that starts the
 * identity-only Google sign-in (useGoogleSignIn, the same hook as every
 * other sign-in button); an auth error renders under it. Signed in → the
 * leader's first name (or email local part) as a link to the leader home
 * (#/leader, ADR-0006). Same large type and ≥48px target as the section
 * links (.ld-nav-link).
 */
import React from 'react';
import { useGoogleSignIn } from '../signup/useGoogleSignIn';
import { SU_SIGNING_IN } from '../signup/signupStrings';
import { useLeaderSession, leaderDisplayName } from '../leader/useLeaderSession';
import { LEADER_HOME_HASH } from '../leader/leaderRoute';
import { NAV_LEADER_SIGNIN } from './landingStrings';
import { SETUP_MIN_FONT_PX } from '../setup/setupStrings';

const linkClass =
  'ld-nav-link rounded-xl text-stl-gold hover:text-stl-gold-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-stl-gold';

const LandingLeaderLink: React.FC = () => {
  const session = useLeaderSession();
  const { signIn, busy, error } = useGoogleSignIn();
  if (session.uid) {
    return (
      <a href={LEADER_HOME_HASH} data-testid="nav-leader" className={linkClass}>
        <span className="font-serif-sc">{leaderDisplayName(session.name, session.email)}</span>
      </a>
    );
  }
  return (
    <>
      <button type="button" data-testid="nav-leader-signin" onClick={() => void signIn()} disabled={busy || session.loading} className={linkClass}>
        {busy ? <span>{SU_SIGNING_IN}</span> : (
          <>
            <span className="font-serif-sc">{NAV_LEADER_SIGNIN.zh}</span>
            <span className="text-stl-text-2">{NAV_LEADER_SIGNIN.en}</span>
          </>
        )}
      </button>
      {error && <p role="alert" data-testid="nav-leader-error" className="px-2 text-red-300" style={{ fontSize: SETUP_MIN_FONT_PX }}>{error}</p>}
    </>
  );
};

export default LandingLeaderLink;
