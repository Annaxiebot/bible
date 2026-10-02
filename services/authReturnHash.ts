/**
 * authReturnHash.ts — come back to the same hash after Google sign-in · 登录后返回原页
 *
 * The OAuth redirect lands on the app root (the implicit flow owns the URL
 * fragment, so a hash route cannot ride in redirectTo). signInWithGoogle
 * remembers the current hash here; the auth manager restores it once the
 * session appears. Storage is injectable for the unit tests.
 */

export const AUTH_RETURN_HASH_KEY = 'auth-return-hash';

export interface HashStore {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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
