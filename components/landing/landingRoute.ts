/**
 * landingRoute.ts — root-view resolution for the landing gate · 首頁路由
 *
 * Only a bare root URL (no hash at all, or a lone "#") shows the landing.
 * "#/pack/<id>" is TV presentation mode; every other hash — "#app" and any
 * bookmarked deep state we do not recognize — falls through to the app, so
 * existing bookmarks keep working.
 */
import { getPackIdFromHash } from '../studypack/packTypes';

/** Hash the landing's "Open the app" CTA sets. */
export const APP_HASH = '#app';

/** Hash the landing's "See a sample pack" CTA sets. */
export const SAMPLE_PACK_ID = '2026-10-02-matt6';
export const SAMPLE_PACK_HASH = `#/pack/${SAMPLE_PACK_ID}`;

export type RootView = 'landing' | 'app' | 'pack';

/** Map a location.hash to the view the root gate should render. */
export function resolveRootView(hash: string): RootView {
  if (getPackIdFromHash(hash)) return 'pack';
  if (hash === '' || hash === '#') return 'landing';
  return 'app';
}
