/**
 * LandingGate.tsx — root gate: landing page vs the rest · 首頁路由開關
 *
 * Wraps StudyPackGate (which already splits "#/pack/<id>" TV mode from the
 * app) and adds one more branch in front: a bare root URL renders the
 * lazy-loaded Landing page. Keeps the touch-point in index.tsx to a single
 * wrapper line, same pattern as StudyPackGate.
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import StudyPackGate from '../studypack/StudyPackGate';
import { resolveRootView, RootView } from './landingRoute';

const Landing = lazy(() => import('./Landing'));

const LandingGate: React.FC<{ app: React.ReactElement }> = ({ app }) => {
  const [view, setView] = useState<RootView>(
    () => resolveRootView(window.location.hash)
  );

  useEffect(() => {
    const onHashChange = () => setView(resolveRootView(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (view !== 'landing') return <StudyPackGate app={app} />;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-slate-950" />}>
      <Landing />
    </Suspense>
  );
};

export default LandingGate;
