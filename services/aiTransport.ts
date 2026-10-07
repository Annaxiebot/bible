/**
 * aiTransport.ts — where an AI request goes · AI请求路由 (ADR-0007)
 *
 * The one branch point for every chat/completions request the app sends
 * (askAIStream.streamChatCompletionDetailed → Ask AI, pack generation, and
 * later the sharing slide / per-section adjust):
 *   1. an OpenRouter key stored in this browser → straight to OpenRouter
 *      (the key's owner pays, their model choice applies), with the SAME
 *      final messages the proxy would build (ownKeyBody, ADR-0014);
 *   2. else a signed-in leader → the ai-proxy Edge Function with the user's
 *      access token (+ the anon apikey header); the body gains `role` and the
 *      server picks the model and counts the month's quota;
 *   3. else → { kind: 'sign-in-needed' } (the UI offers Google sign-in).
 * Status mapping stays with the caller (components/studypack/askAIErrors).
 *
 * E2E seam (dev builds only): window.__LEADER_E2E__ (the leader seam of
 * components/leader/useLeaderSession) + window.__SUPABASE_E2E__ (the fake
 * base of components/signup/signupClient) stand in for a Google session so
 * Playwright can drive the hosted path against a routed fake function.
 */
import { getApiKey, OPENROUTER_API_URL } from './openrouter';
import { authManager, supabase, type AuthState } from './supabase';
import { packSourceProblem, type AIRole } from '../supabase/functions/ai-proxy/policy';
import { buildFinalMessages, isContentLanguage, isPackSource, PromptMessage } from '../supabase/functions/_shared/aiPrompts';
import { E2E_ACCESS_TOKEN, aiProxyUrl } from './aiProxyRoute';
import { e2eLeader } from './e2eLeader';

export type { AIRole } from '../supabase/functions/ai-proxy/policy';

export { AI_PROXY_FUNCTION, E2E_ACCESS_TOKEN, aiProxyUrl } from './aiProxyRoute';

interface HostedSession { baseUrl: string; anonKey: string; accessToken: string }

export type AIRequestResult =
  | { kind: 'own-key' | 'hosted'; response: Response }
  | { kind: 'sign-in-needed' };

interface E2ESeam { uid: string; baseUrl: string; anonKey: string }

function e2eSeam(): E2ESeam | null {
  const leader = e2eLeader();
  if (!leader) return null;
  const base = (window as Window & { __SUPABASE_E2E__?: unknown }).__SUPABASE_E2E__ as { url?: unknown; anonKey?: unknown } | undefined;
  if (typeof base?.url !== 'string' || typeof base.anonKey !== 'string') return null;
  return { uid: leader.uid, baseUrl: base.url, anonKey: base.anonKey };
}

export function hasOwnKey(): boolean {
  return !!getApiKey();
}

/** The signed-in leader's uid for hosted AI (null when signed out). */
export function hostedUid(auth: AuthState = authManager.getState()): string | null {
  if (auth.isAuthenticated && auth.user) return auth.user.id;
  return e2eSeam()?.uid ?? null;
}

/** True when a request would go somewhere: an own key, or a signed-in leader. */
export function isAIAvailable(auth: AuthState = authManager.getState()): boolean {
  return hasOwnKey() || hostedUid(auth) !== null;
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
 * The OpenRouter body for an own-key request: the data form the proxy would
 * receive, turned into the proxy's final messages by the same builder
 * (server system message first; `content_language` and `pack_source` consumed, not forwarded).
 */
export function ownKeyBody(role: AIRole, body: string): string {
  const { content_language: mode, pack_source: source, messages, ...rest } = JSON.parse(body) as Record<string, unknown>;
  if (mode !== undefined && !isContentLanguage(mode)) throw new Error(`Unknown content_language: ${String(mode)}`);
  const sourceProblem = packSourceProblem(role, source); // the proxy's own rule (ADR-0019), so both paths refuse alike
  if (sourceProblem) throw new Error(sourceProblem);
  const sent = Array.isArray(messages) ? messages as PromptMessage[] : [];
  const final = buildFinalMessages(role, sent, isContentLanguage(mode) ? mode : undefined, isPackSource(source) ? source : undefined);
  return JSON.stringify({ ...rest, messages: final });
}

/**
 * Send one chat/completions body (OpenRouter-shaped JSON in the data form:
 * no system message of the app's own except the personal app's, plus
 * `content_language` for Ask AI) by the route above. Network failures reject (the caller wraps them); HTTP
 * statuses come back in the Response for the caller to map.
 */
export async function sendAIRequest(role: AIRole, body: string, signal: AbortSignal, title: string): Promise<AIRequestResult> {
  const apiKey = getApiKey();
  if (apiKey) {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': title,
      },
      body: ownKeyBody(role, body),
    });
    return { kind: 'own-key', response };
  }
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
