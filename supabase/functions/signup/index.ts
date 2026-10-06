/**
 * signup Edge Function · 报名 (ADR-0013)
 *
 * POST { pack_id, name, email, phone?, practices: [{area, practice}],
 * practice_note?, consent } from the public #/signup page. The only way a
 * study_signups row is written: anon has no INSERT on the table and no
 * EXECUTE on mark_replaced_signups (database/signup-endpoint-schema.sql).
 * No JWT (members never sign in): deployed --no-verify-jwt, pinned in
 * supabase/config.toml. The decision lives in signupHandler.ts; this file
 * wires Deno.env, the service client and the trusted welcome request.
 * Secrets: IP_HASH_SALT (new), CHECKIN_CRON_SECRET (shared with
 * send-checkins); SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { preflightResponse, withCors } from '../_shared/cors.ts';
import { clientIp } from '../_shared/clientIp.ts';
import { SIGNUPS_TABLE, STUDY_PACKS_TABLE, RATE_GUARD_ERRCODE } from '../_shared/signup.ts';
import { MARK_REPLACED_FN } from '../send-checkins/replaced.ts';
import { handleSignup, SignupDeps, PackRow, RateGuardError } from './signupHandler.ts';
import { requestWelcome } from './welcome.ts';

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

async function countByIp(client: SupabaseClient, ipHash: string, sinceIso: string): Promise<number> {
  const { count, error } = await client.from(SIGNUPS_TABLE).select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).gte('created_at', sinceIso);
  if (error) throw new Error(`sign-up count (ip) failed: ${error.message}`);
  return count ?? 0;
}

function deps(): SignupDeps {
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const welcome = { supabaseUrl: env('SUPABASE_URL'), anonKey: env('SUPABASE_ANON_KEY'), cronSecret: env('CHECKIN_CRON_SECRET') };
  return {
    salt: env('IP_HASH_SALT'),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    countByIp: (ipHash, sinceIso) => countByIp(client, ipHash, sinceIso),
    loadPack: async packId => {
      const { data, error } = await client.from(STUDY_PACKS_TABLE).select('id, leader_id, title, pack').eq('id', packId).maybeSingle();
      if (error) throw new Error(`study_packs query failed: ${error.message}`);
      return (data as PackRow | null) ?? null;
    },
    insert: async row => {
      const { error } = await client.from(SIGNUPS_TABLE).insert(row);
      if (error?.code === RATE_GUARD_ERRCODE) throw new RateGuardError(error.message);   // the trigger's bilingual line
      if (error) throw new Error(`sign-up insert failed: ${error.message}`);
    },
    markReplaced: async signupId => {
      const { data, error } = await client.rpc(MARK_REPLACED_FN, { p_new_id: signupId });
      if (error) throw new Error(error.message);
      if (typeof data !== 'number') throw new Error(`unexpected reply: ${JSON.stringify(data)}`);
      return data;
    },
    sendWelcome: signupId => requestWelcome(fetch, welcome, signupId),
  };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return preflightResponse(origin);
  try {
    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : null;
    const ip = clientIp(name => request.headers.get(name));
    const reply = await handleSignup(request.method, body, ip, deps());
    return withCors(new Response(JSON.stringify(reply.body), { status: reply.status, headers: JSON_HEADERS }), origin);
  } catch (err) {
    // Surfaced to the page as a 500 with the reason (it shows SU_ERR_SUBMIT + this), never swallowed.
    const error = err instanceof Error ? err.message : String(err);
    return withCors(new Response(JSON.stringify({ error, message: error }), { status: 500, headers: JSON_HEADERS }), origin);
  }
});
