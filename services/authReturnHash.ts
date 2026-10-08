/**
 * authReturnHash.ts — come back to the same hash after Google sign-in · 登录后返回原页
 *
 * The OAuth redirect lands on the app root (the implicit flow owns the URL
 * fragment, so a hash route cannot ride in redirectTo — redirectTo stays
 * origin + pathname, the allowed-redirect entry). signInWithGoogle
 * remembers a return hash in sessionStorage here; the auth manager restores
 * it once the session appears. The return hash is the page the sign-in
 * started on, unless the caller names another (authReturnTarget): the
 * landing nav's "Leader sign-in" names #/leader, since the landing itself is
 * the bare root. Storage is injectable for the unit tests.
 */

export const AUTH_RETURN_HASH_KEY = 'auth-return-hash';

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
export function rememberAuthReturn(hash: string, store: HashStore = window.sessionStorage): void {
  if (hash && hash !== '#') store.setItem(AUTH_RETURN_HASH_KEY, hash);
  else store.removeItem(AUTH_RETURN_HASH_KEY);
}

/** The remembered hash, consumed on read; null when none. */
export function takeAuthReturn(store: HashStore = window.sessionStorage): string | null {
  const hash = store.getItem(AUTH_RETURN_HASH_KEY) ?? null;
  if (hash) store.removeItem(AUTH_RETURN_HASH_KEY);
  return hash;
}
