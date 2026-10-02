/**
 * LandingGate.tsx — root gate: landing page vs the rest · 首页路由开关
 *
 * Wraps StudyPackGate (which already splits "#/pack/<id>" TV mode from the
 * app) and adds branches in front: a bare root URL renders the lazy-loaded
 * Landing page; "#/setup" renders it with the AI setup dialog open; "#/new"
 * renders the New study page. Keeps the touch-point in index.tsx to a
 * single wrapper line, same pattern as StudyPackGate.
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import StudyPackGate from '../studypack/StudyPackGate';
import { resolveRootView, RootView } from './landingRoute';

const Landing = lazy(() => import('./Landing'));
const NewStudyPage = lazy(() => import('../newstudy/NewStudyPage'));

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

  if (view === 'new') {
    return <Suspense fallback={fallback}><NewStudyPage /></Suspense>;
  }
  if (view !== 'landing' && view !== 'setup') return <StudyPackGate app={app} />;
  return (
    <Suspense fallback={fallback}>
      <Landing setupOpen={view === 'setup'} />
    </Suspense>
  );
};

export default LandingGate;
