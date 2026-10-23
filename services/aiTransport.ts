/**
 * aiTransport.ts — where an AI request goes · AI请求路由 (ADR-0007)
 *
 * The one branch point for every chat/completions request the app sends
 * (askAIStream.streamChatCompletionDetailed → Ask AI, pack generation, the
 * sharing slide, per-section adjust, the personal app). One rule since
 * 2026-10-23: sign in to use AI.
 *   1. a signed-in leader → the ai-proxy Edge Function with the user's
 *      access token (+ the anon apikey header); the body gains `role` and the
 *      server picks the model, adds the system message and counts the quota;
 *   2. else → { kind: 'sign-in-needed' } (the UI offers sign-in).
 * There is no direct path to OpenRouter from the browser any more (the
 * own-key option was removed); a key left in a browser is cleared on start
 * (services/obsoleteStorageKeys). Status mapping stays with the caller
 * (components/studypack/askAIErrors).
 *
 * E2E seam (dev builds only): window.__LEADER_E2E__ (the leader seam of
 * components/leader/useLeaderSession) + window.__SUPABASE_E2E__ (the fake
 * base of components/signup/signupClient) stand in for a session so
 * Playwright can drive the hosted path against a routed fake function.
 */
import { authManager, supabase, type AuthState } from './supabase';
import type { AIRole } from '../supabase/functions/ai-proxy/policy';
import { E2E_ACCESS_TOKEN, aiProxyUrl } from './aiProxyRoute';
import { e2eLeader } from './e2eLeader';

export type { AIRole } from '../supabase/functions/ai-proxy/policy';

export { AI_PROXY_FUNCTION, E2E_ACCESS_TOKEN, aiProxyUrl } from './aiProxyRoute';

interface HostedSession { baseUrl: string; anonKey: string; accessToken: string }

export type AIRequestResult =
  | { kind: 'hosted'; response: Response }
  | { kind: 'sign-in-needed' };

interface E2ESeam { uid: string; baseUrl: string; anonKey: string }

function e2eSeam(): E2ESeam | null {
  const leader = e2eLeader();
  if (!leader) return null;
  const base = (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__ as { url?: unknown; anonKey?: unknown } | undefined;
  if (typeof base?.url !== 'string' || typeof base.anonKey !== 'string') return null;
  return { uid: leader.uid, baseUrl: base.url, anonKey: base.anonKey };
}

/** The signed-in leader's uid for hosted AI (null when signed out). */
export function hostedUid(auth: AuthState = authManager.getState()): string | null {
  if (auth.isAuthenticated && auth.user) return auth.user.id;
  return e2eSeam()?.uid ?? null;
}

/** True when a request would go somewhere: a signed-in leader. */
export function isAIAvailable(auth: AuthState = authManager.getState()): boolean {
  return hostedUid(auth) !== null;
}

async function hostedSession(): Promise<HostedSession | null> {
  const seam = e2eSeam();
  if (seam) return { baseUrl: seam.baseUrl, anonKey: seam.anonKey, accessToken: E2E_ACCESS_TOKEN };
  if (!supabase) return null;
  // getSession refreshes an expired access token before handing it out.
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Supabase session: ${error.message}`);
  const token = data.session?.access_token;
  if (!token) return null;
  return { baseUrl: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY, accessToken: token };
}

/**
 * Send one chat/completions body (OpenRouter-shaped JSON in the data form:
 * no system message of the app's own except the personal app's, plus
 * `content_language` for Ask AI) to the proxy. Network failures reject (the
 * caller wraps them); HTTP statuses come back in the Response for the caller
 * to map.
 */
export async function sendAIRequest(role: AIRole, body: string, signal: AbortSignal): Promise<AIRequestResult> {
  const session = await hostedSession();
  if (!session) return { kind: 'sign-in-needed' };
  const response = await fetch(aiProxyUrl(session.baseUrl), {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.accessToken}`,
      'apikey': session.anonKey,
    },
    body: JSON.stringify({ ...(JSON.parse(body) as Record<string, unknown>), role }),
  });
  return { kind: 'hosted', response };
}
