/**
 * heroThemeSession.ts — pick the hero theme once per session · 每次造访只选一次
 *
 * Reads `?theme=<id>` and the sample pack, selects via selectHeroTheme, and
 * pins the result in sessionStorage so a reload never switches themes
 * mid-visit. An explicit `?theme=` override always wins and is pinned too.
 */
import { HERO_THEMES, HeroTheme, selectHeroTheme } from './heroThemes';
import { SAMPLE_PACK_HASH } from './landingRoute';
import { getPackIdFromHash } from '../studypack/packTypes';

export const THEME_PARAM = 'theme';
export const THEME_SESSION_KEY = 'ld-hero-theme';

export interface SessionEnv {
  search: string;          // window.location.search
  hour: number;            // local hour
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
}

function readStored(storage: SessionEnv['storage']): string | null {
  try {
    return storage ? storage.getItem(THEME_SESSION_KEY) : null;
  } catch {
    // sessionStorage can throw in private mode or with storage blocked;
    // a fresh selection is the correct fallback, so swallowing is intended.
    return null;
  }
}

function writeStored(storage: SessionEnv['storage'], id: string): void {
  try {
    storage?.setItem(THEME_SESSION_KEY, id);
  } catch {
    // Same as readStored: no storage means no pinning, nothing else breaks.
  }
}

/** Resolve the theme for this session, given an explicit environment (pure apart from storage). */
export function resolveSessionTheme(env: SessionEnv): HeroTheme {
  const override = new URLSearchParams(env.search).get(THEME_PARAM);
  const stored = override ? null : readStored(env.storage);
  const theme = selectHeroTheme({
    hour: env.hour,
    packId: getPackIdFromHash(SAMPLE_PACK_HASH),
    override: override ?? stored,
  }, HERO_THEMES);
  writeStored(env.storage, theme.id);
  return theme;
}

/** Browser entry point: reads window + the clock. */
export function resolveSessionThemeFromWindow(): HeroTheme {
  return resolveSessionTheme({
    search: window.location.search,
    hour: new Date().getHours(),
    storage: window.sessionStorage,
  });
}
