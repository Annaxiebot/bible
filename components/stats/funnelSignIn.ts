/**
 * funnelSignIn.ts — count sign-ins started and finished, by method · 登录漏斗计数 (ADR-0025)
 *
 * The sign-in card (components/signin: Google, or email) calls
 * noteSignInStart(method): it counts "sign-in started" and remembers the
 * method in this browser for AUTH_RETURN_TTL_MS (the emailed link opens a new
 * tab, Google a redirect). finishSignIn() turns that note into one "sign-in
 * finished" count and forgets it; it runs when the session appears
 * (startFunnelSignInWatch, from index.tsx) and when an emailed code is
 * accepted on this page (useEmailSignIn) — whichever comes first, once.
 * A session that appears with no note (restored on load, or a sign-in from
 * the personal app) counts nothing. Nothing here leaves the browser except
 * the anonymous counts (funnel.ts).
 */
import { authManager, type AuthState } from '../../services/supabase';
import { AUTH_RETURN_TTL_MS } from '../../services/authReturnHash';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import { trackFunnel, browserStore } from './funnel';
import { SIGN_IN_METHODS, signInStartedEvent, signInDoneEvent, type SignInMethod } from './funnelRules';

type NoteStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Count "sign-in started" and remember the method until the session appears (or the note expires). */
export function noteSignInStart(method: SignInMethod, now = Date.now(), store: NoteStore | null = browserStore()): void {
  trackFunnel(signInStartedEvent(method));
  try {
    store?.setItem(STORAGE_KEYS.FUNNEL_SIGN_IN, JSON.stringify({ method, until: now + AUTH_RETURN_TTL_MS }));
  } catch {
    // Blocked storage: this sign-in's finish goes uncounted (R5 (c): an anonymous total, never the leader's concern).
  }
}

/** The remembered method, consumed on read; null when none, expired or unreadable. */
export function takeSignInNote(now = Date.now(), store: NoteStore | null = browserStore()): SignInMethod | null {
  try {
    const raw = store?.getItem(STORAGE_KEYS.FUNNEL_SIGN_IN) ?? null;
    if (raw === null) return null;
    store?.removeItem(STORAGE_KEYS.FUNNEL_SIGN_IN);
    const { method, until } = JSON.parse(raw) as { method?: unknown; until?: unknown };
    const known = SIGN_IN_METHODS.find(m => m === method);
    return known && typeof until === 'number' && now <= until ? known : null;
  } catch {
    // Blocked storage or an unreadable note: no finish is counted (R5 (c): a wrong count is worse than none).
    return null;
  }
}

/** Count "sign-in finished" for a sign-in started here; a no-op otherwise or a second time. */
export function finishSignIn(now = Date.now(), store: NoteStore | null = browserStore()): void {
  const method = takeSignInNote(now, store);
  if (method) trackFunnel(signInDoneEvent(method));
}

/** Watch the session once per app start: a sign-in started here finishes when it appears. Returns the unsubscribe. */
export function startFunnelSignInWatch(
  subscribe: (listener: (state: AuthState) => void) => () => void = l => authManager.subscribe(l),
): () => void {
  return subscribe(state => {
    if (!state.isLoading && state.isAuthenticated) finishSignIn();
  });
}
