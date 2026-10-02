/**
 * LandingGate.tsx — root gate: landing page vs the rest · 首页路由开关
 *
 * Wraps StudyPackGate (which already splits "#/pack/<id>" TV mode from the
 * app) and adds branches in front: a bare root URL renders the lazy-loaded
 * Landing page; "#/setup" renders it with the AI setup dialog open; "#/new"
 * (and "#/new/<id>") the New study page; "#/signup/<id>", "#/leader/<id>"
 * and "#/checkin/<signupId>" their pages. Keeps the touch-point in
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

const Landing = lazy(() => import('./Landing'));
const NewStudyPage = lazy(() => import('../newstudy/NewStudyPage'));
const SignupPage = lazy(() => import('../signup/SignupPage'));
const LeaderPage = lazy(() => import('../leader/LeaderPage'));
const CheckinPage = lazy(() => import('../checkin/CheckinPage'));

const fallback = <div className="fixed inset-0 bg-slate-950" />;

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
