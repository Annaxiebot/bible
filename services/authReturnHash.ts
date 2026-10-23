/**
 * authReturnHash.ts — come back to the same hash after sign-in · 登录后返回原页
 *
 * The sign-in redirect lands on the app root (the implicit flow owns the URL
 * fragment, so a hash route cannot ride in redirectTo — redirectTo stays
 * origin + pathname, the allowed-redirect entry). Starting a sign-in (Google,
 * or an emailed link/code, ADR-0020) remembers a return hash here; the auth
 * manager restores it once the session appears. The return hash is the page
 * the sign-in started on, unless the caller names another
 * (authReturnTarget): the landing nav's "Leader sign-in" names #/leader,
 * since the landing itself is the bare root.
 *
 * Kept in localStorage (not sessionStorage) because an emailed link opens
 * in a new tab of the same browser; it expires after AUTH_RETURN_TTL_MS so
 * an abandoned sign-in cannot redirect a later visit, and it is consumed on
 * read. Storage is injectable for the unit tests.
 */

export const AUTH_RETURN_HASH_KEY = 'auth-return-hash';
/** Longer than the emailed link's validity (15 minutes) plus the time to open the email. */
export const AUTH_RETURN_TTL_MS = 60 * 60 * 1000;

export interface HashStore {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Where a sign-in should come back to: the caller's explicit returnTo, else the page it started on. */
export function authReturnTarget(currentHash: string, returnTo?: string): string {
  return returnTo ?? currentHash;
}

/** Remember a hash route to return to; a bare root ('' or '#') clears any earlier one. */
export function rememberAuthReturn(hash: string, store: HashStore = window.localStorage, now = Date.now()): void {
  if (hash && hash !== '#') store.setItem(AUTH_RETURN_HASH_KEY, JSON.stringify({ hash, until: now + AUTH_RETURN_TTL_MS }));
  else store.removeItem(AUTH_RETURN_HASH_KEY);
}

/** The remembered hash, consumed on read; null when none, expired or unreadable. */
export function takeAuthReturn(store: HashStore = window.localStorage, now = Date.now()): string | null {
  const raw = store.getItem(AUTH_RETURN_HASH_KEY) ?? null;
  if (raw === null) return null;
  store.removeItem(AUTH_RETURN_HASH_KEY);
  try {
    const { hash, until } = JSON.parse(raw) as { hash?: unknown; until?: unknown };
    return typeof hash === 'string' && typeof until === 'number' && now <= until ? hash : null;
  } catch {
    // An unreadable record (e.g. the plain hash an older build left) is dropped on purpose: no return beats a wrong one.
    return null;
  }
}
