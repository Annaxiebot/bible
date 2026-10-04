/**
 * LandingGate.tsx — root gate: landing page vs the rest · 首页路由开关
 *
 * Wraps StudyPackGate (which already splits "#/pack/<id>" TV mode from the
 * app) and adds branches in front: a bare root URL renders the lazy-loaded
 * Landing page; "#/setup" renders it with the AI setup dialog open; "#/new"
 * (and "#/new/<id>") the New study page; "#/signup/<id>", "#/leader" (home),
 * "#/leader/<id>" and "#/checkin/<signupId>" their pages. Keeps the touch-point in
 * index.tsx to a single wrapper line, same pattern as StudyPackGate. Also
 * the one place the sign-in claim hook is installed (claimLocalPacks).
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import StudyPackGate from '../studypack/StudyPackGate';
import { resolveRootView, RootView } from './landingRoute';
import { getSignupPackIdFromHash } from '../signup/signupRoute';
import { getLeaderPackIdFromHash } from '../leader/leaderRoute';
import { getCheckinFromHash } from '../checkin/checkinRoute';
import { installClaimOnSignIn } from '../newstudy/claimLocalPacks';

// One loader per page, shared by lazy() and preloadLandingPages().
const pageLoaders = {
  landing: () => import('./Landing'),
  newStudy: () => import('../newstudy/NewStudyPage'),
  signup: () => import('../signup/SignupPage'),
  leader: () => import('../leader/LeaderPage'),
  leaderHome: () => import('../leader/LeaderHome'),
  checkin: () => import('../checkin/CheckinPage'),
};

/**
 * Warm every lazy page module. Tests that assert on a rendered page `await`
 * this at file top level: the first dynamic import is 0.1 s idle but several
 * seconds under heavy CPU load, which blew the 1 s findBy budget. The app
 * itself never needs it — Suspense shows the fallback meanwhile.
 */
export function preloadLandingPages(): Promise<unknown> {
  return Promise.all(Object.values(pageLoaders).map(load => load()));
}

const Landing = lazy(pageLoaders.landing);
const NewStudyPage = lazy(pageLoaders.newStudy);
const SignupPage = lazy(pageLoaders.signup);
const LeaderPage = lazy(pageLoaders.leader);
const LeaderHome = lazy(pageLoaders.leaderHome);
const CheckinPage = lazy(pageLoaders.checkin);

const fallback = <div className="fixed inset-0 bg-stl-bg" />;

const LandingGate: React.FC<{ app: React.ReactElement }> = ({ app }) => {
  const [view, setView] = useState<RootView>(
    () => resolveRootView(window.location.hash)
  );

  useEffect(() => {
    const onHashChange = () => setView(resolveRootView(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => installClaimOnSignIn(), []);

  if (view === 'new') {
    return <Suspense fallback={fallback}><NewStudyPage /></Suspense>;
  }
  if (view === 'signup') {
    const packId = getSignupPackIdFromHash(window.location.hash)!;
    return <Suspense fallback={fallback}><SignupPage packId={packId} /></Suspense>;
  }
  if (view === 'leader') {
    const packId = getLeaderPackIdFromHash(window.location.hash)!;
    return <Suspense fallback={fallback}><LeaderPage packId={packId} /></Suspense>;
  }
  if (view === 'leaderHome') {
    return <Suspense fallback={fallback}><LeaderHome /></Suspense>;
  }
  if (view === 'checkin') {
    const route = getCheckinFromHash(window.location.hash)!;
    return <Suspense fallback={fallback}><CheckinPage signupId={route.signupId} kind={route.kind} /></Suspense>;
  }
  if (view !== 'landing' && view !== 'setup') return <StudyPackGate app={app} />;
  return (
    <Suspense fallback={fallback}>
      <Landing setupOpen={view === 'setup'} />
    </Suspense>
  );
};

export default LandingGate;
