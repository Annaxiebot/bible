/**
 * StudyPackGate.tsx — hash-route gate for TV presentation mode · 路由开关
 *
 * "#/pack/<id>" renders the full-screen TV view; anything else renders the
 * normal app. Keeps the touch-point in index.tsx to a single wrapper line.
 */
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { getPackIdFromHash } from './packTypes';
import { getShareTokenFromHash } from './packShare';
import { takeTvReturn } from './tvReturn';
import { LANDING_HASH } from '../landing/landingRoute';

const TVPresentationView = lazy(() => import('./TVPresentationView'));

/** "#/pack/<id>" → the leader's deck; "#/view/<token>" → a member's read-only shared pack (ADR-0026). */
function routeFromHash(hash: string): { packId: string | null; shareToken: string | null } {
  return { packId: getPackIdFromHash(hash), shareToken: getShareTokenFromHash(hash) };
}

const StudyPackGate: React.FC<{ app: React.ReactElement }> = ({ app }) => {
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const { packId, shareToken } = route;
  if (!packId && !shareToken) return app;
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-slate-950" />}>
      {/* Exit returns to the editor that opened the preview (tvReturn), else to the app; a member exits to the landing. */}
      {shareToken
        ? <TVPresentationView packId={shareToken} shareToken={shareToken} onExit={() => { window.location.hash = LANDING_HASH; }} />
        : <TVPresentationView packId={packId!} onExit={() => { window.location.hash = takeTvReturn(packId!); }} />}
    </Suspense>
  );
};

export default StudyPackGate;
