/**
 * StudyPackGate.tsx — hash-route gate for TV presentation mode · 路由开关
 *
 * "#/pack/<id>" renders the full-screen TV view; anything else renders the
 * normal app. Keeps the touch-point in index.tsx to a single wrapper line.
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { getPackIdFromHash } from './packTypes';

const TVPresentationView = lazy(() => import('./TVPresentationView'));

const StudyPackGate: React.FC<{ app: React.ReactElement }> = ({ app }) => {
  const [packId, setPackId] = useState<string | null>(
    () => getPackIdFromHash(window.location.hash)
  );

  useEffect(() => {
    const onHashChange = () => setPackId(getPackIdFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!packId) return app;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-slate-950" />}>
      <TVPresentationView packId={packId} onExit={() => { window.location.hash = ''; }} />
    </Suspense>
  );
};

export default StudyPackGate;
