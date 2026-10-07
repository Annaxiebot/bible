/**
 * ai-proxy Edge Function · 本站AI代理 (ADR-0007)
 *
 * POST /ai-proxy
 * Body: { role: 'ask'|'pack'|'adjust'|'sharing'|'study'|'pick', messages: [{role, content}],
 *         stream?, max_tokens?, temperature?, model?, reasoning?,
 *         content_language? (Ask AI: the pack's mode) }
 *
 * Any signed-in leader may use AI with no key of their own: this function
 * calls OpenRouter with ONE server-side key (secret OPENROUTER_API_KEY).
 * - Caller = the user behind the Authorization bearer (the gateway's
 *   verify_jwt checks it; callerUid resolves the uid with an anon client).
 * - The server picks the model (policy.chooseModel: role default + per-role
 *   allowlist) and clamps max_tokens per role.
 * - The server owns the system message (ADR-0014, _shared/aiPrompts): a
 *   scope guard + the role's rules go first; a browser system message is
 *   dropped (kept after the guard only for the personal app, role 'study').
 * - Per-leader monthly quota per role: consume_ai_quota (database/
 *   ai-usage-schema.sql) via the service client; limits from secrets
 *   AI_MONTHLY_* (policy.monthlyLimit). Over the limit → 429 quota.
 * - Kill switch AI_PROXY_ENABLED='0' → 503 disabled; no key → 503
 *   not-configured; OpenRouter 402 → 402 no-credit (responses.ts).
 * - Stream: OpenRouter's SSE body is passed through unchanged; non-stream
 *   JSON likewise. Message content is never logged (responses.logLine).
 *
 * Deno-only imports stay in this file; the helpers are plain TS under vitest.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { validateRequest, upstreamBody, monthlyLimit, ProxyRequest, QUOTA_FUNCTION } from './policy.ts';
import {
  corsHeaders, isAllowedOrigin, preAuthGate, quotaFailure, upstreamFailure, logLine,
  OPENROUTER_CHAT_URL, SITE_ORIGIN, SITE_TITLE, Failure,
} from './responses.ts';

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

function json(origin: string | null, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

/** The uid behind a user JWT (null when the header is missing or invalid). Same shape as send-checkins. */
async function callerUid(request: Request): Promise<string | null> {
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user?.id ?? null;
}

/** Count this call against the leader's month; a Failure when over the limit. Throws on a DB error. */
async function consumeQuota(uid: string, req: ProxyRequest): Promise<Failure | null> {
  const limit = monthlyLimit(req.role, env);
  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data, error } = await service.rpc(QUOTA_FUNCTION, { p_leader: uid, p_role: req.role, p_limit: limit });
  if (error) throw new Error(`${QUOTA_FUNCTION} failed: ${error.message}`);
  return quotaFailure(Number(data), req.role, limit);
}

async function forward(origin: string | null, req: ProxyRequest): Promise<Response> {
  const upstream = await fetch(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env('OPENROUTER_API_KEY').trim()}`,
      'HTTP-Referer': SITE_ORIGIN,
      'X-Title': SITE_TITLE,
    },
    body: JSON.stringify(upstreamBody(req)),
  });
  if (!upstream.ok) {
    const failure = upstreamFailure(upstream.status, await upstream.json().catch(() => null));
    return json(origin, failure.status, failure.body);
  }
  const contentType = upstream.headers.get('Content-Type') ?? (req.stream ? 'text/event-stream' : 'application/json');
  return new Response(upstream.body, { status: 200, headers: { ...corsHeaders(origin), 'Content-Type': contentType } });
}

async function handle(request: Request, origin: string | null): Promise<{ response: Response; role: string; uid: string | null }> {
  const done = (response: Response, role = '-', uid: string | null = null) => ({ response, role, uid });
  if (request.method === 'OPTIONS') {
    return done(new Response(null, { status: isAllowedOrigin(origin) ? 204 : 403, headers: corsHeaders(origin) }));
  }
  if (request.method !== 'POST') return done(json(origin, 405, { error: 'POST only' }));
  if (origin !== null && !isAllowedOrigin(origin)) return done(json(origin, 403, { error: 'origin' }));
  const gate = preAuthGate(env);
  if (gate) return done(json(origin, gate.status, gate.body));
  const uid = await callerUid(request);
  if (!uid) return done(json(origin, 401, { error: 'unauthorized' }));
  const validation = validateRequest(await request.json().catch(() => null));
  if (!validation.ok) return done(json(origin, 400, { error: validation.error, detail: validation.detail }), '-', uid);
  const req = validation.request;
  const over = await consumeQuota(uid, req);
  if (over) return done(json(origin, over.status, over.body), req.role, uid);
  return done(await forward(origin, req), req.role, uid);
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  try {
    const { response, role, uid } = await handle(request, origin);
    console.info(logLine(role, uid, response.status));
    return response;
  } catch (err) {
    // Surfaced to the caller as a 500 body (no message content involved), never swallowed.
    console.info(logLine('-', null, 500));
    return json(origin, 500, { error: 'internal', detail: err instanceof Error ? err.message : String(err) });
  }
});
