/**
 * feedback Edge Function · 意见反馈 (ADR-0011)
 *
 * POST { message, email?, website (honeypot), context? } from the public
 * #/feedback page. No JWT (the page is public): deployed --no-verify-jwt,
 * pinned in supabase/config.toml. The decision lives in feedbackHandler.ts
 * (validation before any write, ≤ 5 per hour per salted IP hash); this file
 * wires Deno.env, the service client and the check-in Resend sender.
 * Secrets: FEEDBACK_SALT (IP hash salt), FEEDBACK_TO (the owner's inbox,
 * never sent to the browser), RESEND_API_KEY + CHECKIN_FROM (shared).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { preflightResponse, withCors } from '../_shared/cors.ts';
import { emailConfig, sendEmail } from '../send-checkins/senders.ts';
import { feedbackEmailConfig } from './feedbackEmail.ts';
import { clientIp } from '../_shared/clientIp.ts';
import { handleFeedback, FEEDBACK_TABLE, FeedbackDeps } from './feedbackHandler.ts';

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

function deps(): FeedbackDeps {
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  return {
    salt: env('FEEDBACK_SALT'),
    now: () => new Date(),
    countSince: async (ipHash, sinceIso) => {
      const { count, error } = await client.from(FEEDBACK_TABLE).select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash).gte('created_at', sinceIso);
      if (error) throw new Error(`feedback count failed: ${error.message}`);
      return count ?? 0;
    },
    insert: async row => {
      const { data, error } = await client.from(FEEDBACK_TABLE).insert(row).select('id, created_at').single();
      if (error) throw new Error(`feedback insert failed: ${error.message}`);
      return data as { id: string; created_at: string };
    },
    send: async (message, replyTo) => {
      const to = env('FEEDBACK_TO').trim();
      if (!to) throw new Error('FEEDBACK_TO is not set');
      await sendEmail(feedbackEmailConfig(emailConfig(env), replyTo), to, message);
    },
    logError: message => console.error(message),
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return preflightResponse(origin);
  try {
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : null;
    const ip = clientIp(name => request.headers.get(name));
    const reply = await handleFeedback(request.method, body, ip, deps());
    return withCors(new Response(JSON.stringify(reply.body), { status: reply.status, headers: JSON_HEADERS }), origin);
  } catch (err) {
    // Surfaced to the page as a 500 (it shows the server-failure line), never swallowed.
    const error = err instanceof Error ? err.message : String(err);
    return withCors(new Response(JSON.stringify({ error }), { status: 500, headers: JSON_HEADERS }), origin);
  }
});
