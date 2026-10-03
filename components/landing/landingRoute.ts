/**
 * landingRoute.ts — root-view resolution for the landing gate · 首页路由
 *
 * Only a bare root URL (no hash at all, or a lone "#") shows the landing.
 * "#/pack/<id>" is TV presentation mode, "#/signup/<id>" the member sign-up
 * page, "#/leader" the leader home, "#/leader/<id>" the leader's sign-up
 * list; every other hash — "#app"
 * and any bookmarked deep state we do not recognize — falls through to the
 * app, so existing bookmarks keep working.
 */
import { getPackIdFromHash } from '../studypack/packTypes';
import { getSignupPackIdFromHash } from '../signup/signupRoute';
import { getLeaderPackIdFromHash, isLeaderHomeHash } from '../leader/leaderRoute';
import { getCheckinFromHash } from '../checkin/checkinRoute';

/** Hash the landing's "Open the app" CTA sets. */
export const APP_HASH = '#app';

/** TV-mode hash for a pack id (inverse of getPackIdFromHash). */
export function packHash(packId: string): string {
  return `#/pack/${packId}`;
}

/** Hash the landing's "See a sample pack" CTA sets. */
export const SAMPLE_PACK_ID = '2026-10-02-matt6';
export const SAMPLE_PACK_HASH = packHash(SAMPLE_PACK_ID);

/** Hash that opens the landing with the quick AI setup dialog (a pastor can be sent this link). */
export const SETUP_HASH = '#/setup';

/** Hash of the "新建查经 New study" page (leader generates a pack in the browser). */
export const NEW_STUDY_HASH = '#/new';

const NEW_STUDY_PACK_RE = /^#\/new\/([A-Za-z0-9._-]+)$/;

/** Editor hash for a saved local pack: "#/new/<packId>" reopens it in the editor (survives reload). */
export function newStudyHash(packId: string): string {
  return `${NEW_STUDY_HASH}/${packId}`;
}

/** "#/new/<id>" → pack id; "#/new" and anything else → null. */
export function getNewStudyPackIdFromHash(hash: string): string | null {
  const match = NEW_STUDY_PACK_RE.exec(hash);
  return match ? match[1] : null;
}

export type RootView = 'landing' | 'setup' | 'app' | 'pack' | 'new' | 'signup' | 'leader' | 'leaderHome' | 'checkin';

/** Map a location.hash to the view the root gate should render. */
export function resolveRootView(hash: string): RootView {
  if (getPackIdFromHash(hash)) return 'pack';
  if (getSignupPackIdFromHash(hash)) return 'signup';
  if (getLeaderPackIdFromHash(hash)) return 'leader';
  if (isLeaderHomeHash(hash)) return 'leaderHome';
  if (getCheckinFromHash(hash)) return 'checkin';
  if (hash === '' || hash === '#') return 'landing';
  if (hash === SETUP_HASH) return 'setup';
  if (hash === NEW_STUDY_HASH || getNewStudyPackIdFromHash(hash)) return 'new';
  return 'app';
}
