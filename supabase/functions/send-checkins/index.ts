/**
 * send-checkins Edge Function · 周中提醒发送
 *
 * POST /send-checkins
 * Body: { pack_id, kind?: 'tue'|'thu'|'weekend', scheduled?: boolean,
 *         test_to?: email, test_name?: string }
 *   or  { kind: 'welcome', signup_id }   — the sign-up confirmation
 *
 * - kind defaults to the Los Angeles weekday; `scheduled: true` (pg_cron)
 *   additionally requires the 09:00 LA hour so the PST/PDT cron pair sends once.
 * - The pack's text comes from its pack_summaries row (written by the owner's
 *   browser), else the public pack JSON on scripturetolife.org (packSource.ts).
 *   Nothing in the request body supplies message content.
 * - Only a trusted caller (header x-checkin-secret = secret CHECKIN_CRON_SECRET;
 *   see trust.ts for why the service-role key is not used) may send to the
 *   sign-up list. Any other caller must be the pack's owning leader (JWT uid
 *   = pack.leaderId) and is forced into a dry run addressed to `test_to`.
 *   The leader_id of every row must match the pack's leaderId (verifyLeader);
 *   nothing client-supplied is trusted for ownership.
 * - 'welcome' is the one anonymous path: the member's browser passes the
 *   signup id it just received; the row must exist and be younger than
 *   WELCOME_WINDOW_MS (recipients.welcomeAllowed). One email, to that row.
 * - DRY_RUN=1 logs instead of sending. Every attempt — sent, dry-run or
 *   failed — writes one checkin_sends row.
 * - Email headers come from secrets: CHECKIN_FROM (default CHECKIN_FROM_EMAIL)
 *   and CHECKIN_REPLY_TO (optional; senders.emailConfig). SMS is unaffected.
 *
 * Deno-only imports stay in this file; the helpers are plain TS under vitest.
 */
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CheckinKind, MessageKind, CheckinPack, WELCOME_KIND, isCheckinKind, kindFromDate, isSendHour, publicPackJsonUrl, renderCheckin,
} from './templates.ts';
import { loadCheckinPack, PACK_SUMMARIES_TABLE, SUMMARY_COLUMNS, PackSummaryRow } from './packSource.ts';
import {
  selectRecipients, testRecipientRow, verifyLeader, memberContext, welcomeAllowed, Recipient, SignupRow,
} from './recipients.ts';
import { emailConfig, sendEmail, sendSms, TwilioConfig } from './senders.ts';
import { isTrustedCaller, CRON_SECRET_HEADER } from './trust.ts';
import { REPLACED_COLUMN } from './replaced.ts';
import { preflightResponse, withCors } from '../_shared/cors.ts';

/** Must equal components/studypack/packTypes.ts PACK_SCHEMA_VERSION (pinned by checkins.test.ts). */
export const PACK_SCHEMA_VERSION = 2;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SIGNUP_COLUMNS = `id, pack_id, leader_id, name, phone, email, consent_checkins, practice_area, practice_text, practice2_area, practice2_text, practice_note, practices, created_at, ${REPLACED_COLUMN}`;

interface RequestBody {
  pack_id?: unknown;
  kind?: unknown;
  scheduled?: unknown;
  test_to?: unknown;
  test_name?: unknown;
  signup_id?: unknown;
}

interface SendResult {
  signup_id: string | null;
  channel: Recipient['channel'];
  to: string;
  status: 'sent' | 'dry-run' | 'failed';
  error?: string;
}

function env(name: string): string {
  return Deno.env.get(name) ?? '';
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function trustedRequest(request: Request): boolean {
  return isTrustedCaller(request.headers.get(CRON_SECRET_HEADER), env('CHECKIN_CRON_SECRET'));
}

function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
}

function loadPack(client: SupabaseClient, packId: string): Promise<CheckinPack> {
  return loadCheckinPack(packId, {
    readSummary: async id => {
      const { data, error } = await client.from(PACK_SUMMARIES_TABLE).select(SUMMARY_COLUMNS).eq('pack_id', id).maybeSingle();
      if (error) throw new Error(`pack_summaries query failed: ${error.message}`);
      return (data as PackSummaryRow | null) ?? null;
    },
    fetchPublic: async id => {
      const response = await fetch(publicPackJsonUrl(id, PACK_SCHEMA_VERSION));
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Public pack ${id}: HTTP ${response.status}`);
      return response.json();
    },
  });
}

async function loadSignups(client: SupabaseClient, packId: string): Promise<SignupRow[]> {
  // Live rows only: a row replaced by a later sign-up (same pack + email) gets nothing (replaced.ts).
  const { data, error } = await client.from('study_signups').select(SIGNUP_COLUMNS).eq('pack_id', packId).is(REPLACED_COLUMN, null);
  if (error) throw new Error(`study_signups query failed: ${error.message}`);
  return (data ?? []) as SignupRow[];
}

async function loadSignup(client: SupabaseClient, signupId: string): Promise<SignupRow | null> {
  const { data, error } = await client.from('study_signups').select(SIGNUP_COLUMNS).eq('id', signupId).maybeSingle();
  if (error) throw new Error(`study_signups query failed: ${error.message}`);
  return (data as SignupRow | null) ?? null;
}

function twilioConfig(): TwilioConfig {
  return { accountSid: env('TWILIO_ACCOUNT_SID'), authToken: env('TWILIO_AUTH_TOKEN'), from: env('TWILIO_FROM') };
}

async function deliver(recipient: Recipient, kind: MessageKind, pack: CheckinPack, dryRun: boolean): Promise<SendResult> {
  const message = renderCheckin(kind, pack, memberContext(recipient.signup));
  const base = { signup_id: recipient.signup.id, channel: recipient.channel, to: recipient.to };
  if (dryRun) {
    // DRY_RUN contract: log what would have gone out (function logs) and audit it below; never send.
    console.info('[dry-run]', recipient.channel, recipient.to, message.subject);
    return { ...base, status: 'dry-run' };
  }
  try {
    if (recipient.channel === 'email') await sendEmail(emailConfig(env), recipient.to, message);
    else await sendSms(twilioConfig(), recipient.to, message);
    return { ...base, status: 'sent' };
  } catch (err) {
    // Surfaced: recorded in checkin_sends and returned in the response body.
    return { ...base, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

async function audit(
  client: SupabaseClient, packId: string, leaderId: string, kind: MessageKind, result: SendResult,
): Promise<string | null> {
  const { error } = await client.from('checkin_sends').insert({
    signup_id: result.signup_id, pack_id: packId, leader_id: leaderId, kind, channel: result.channel,
    status: result.status, error: result.error ?? null,
  });
  return error ? `checkin_sends insert failed for ${result.to}: ${error.message}` : null;
}

/** The uid behind a user JWT (null when the header is missing or invalid). */
async function callerUid(request: Request): Promise<string | null> {
  const auth = request.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const client = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user?.id ?? null;
}

function resolveKind(body: RequestBody, now: Date): CheckinKind | null {
  if (isCheckinKind(body.kind)) return body.kind;
  return kindFromDate(now);
}

/** Deliver to every recipient, audit each attempt, and shape the response. */
async function sendAll(
  client: SupabaseClient, pack: CheckinPack, leaderId: string, kind: MessageKind, rows: SignupRow[], dryRun: boolean,
): Promise<Response> {
  const selection = selectRecipients(rows, { smsEnabled: env('CHECKIN_SMS_ENABLED') === '1' });
  const results: SendResult[] = [];
  const auditErrors: string[] = [];
  for (const recipient of selection.recipients) {
    const result = await deliver(recipient, kind, pack, dryRun);
    results.push(result);
    const auditError = await audit(client, pack.id, leaderId, kind, result);
    if (auditError) auditErrors.push(auditError);
  }
  return jsonResponse(auditErrors.length ? 500 : 200, {
    pack_id: pack.id, kind, dry_run: dryRun,
    attempted: results.length,
    sent: results.filter(r => r.status === 'sent').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: selection.skipped.map(s => ({ signup_id: s.signup.id, reason: s.reason })),
    results, audit_errors: auditErrors,
  });
}

/** The anonymous welcome: one email to the signup row the browser just created. */
async function handleWelcome(body: RequestBody, now: Date): Promise<Response> {
  if (typeof body.signup_id !== 'string' || body.signup_id.length === 0) return jsonResponse(400, { error: 'signup_id is required' });
  const client = serviceClient();
  const row = await loadSignup(client, body.signup_id);
  if (!row) return jsonResponse(404, { error: 'unknown signup' });
  const allowed = welcomeAllowed(row, now);
  if (!allowed.ok) return jsonResponse(403, { error: allowed.reason });
  const pack = await loadPack(client, row.pack_id);
  const leaderId = verifyLeader(pack, [row]);
  return sendAll(client, pack, leaderId, WELCOME_KIND, [row], env('DRY_RUN') === '1');
}

async function handle(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'POST only' });
  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const now = new Date();
  if (body.kind === WELCOME_KIND) return handleWelcome(body, now);
  if (typeof body.pack_id !== 'string' || body.pack_id.length === 0) {
    return jsonResponse(400, { error: 'pack_id is required' });
  }
  if (body.scheduled === true && !isSendHour(now)) {
    return jsonResponse(200, { skipped: 'off-hour', now: now.toISOString() });
  }
  const kind = resolveKind(body, now);
  if (!kind) return jsonResponse(200, { skipped: 'no check-in today', now: now.toISOString() });

  const trusted = trustedRequest(request);
  const testTo = typeof body.test_to === 'string' && body.test_to.includes('@') ? body.test_to : null;
  if (!trusted && !testTo) return jsonResponse(403, { error: 'Leaders may only send a test to their own email (test_to)' });
  const dryRun = !trusted || env('DRY_RUN') === '1' || testTo !== null;

  const client = serviceClient();
  const pack = await loadPack(client, body.pack_id);
  if (pack.id !== body.pack_id) return jsonResponse(400, { error: `pack_id ${body.pack_id} does not match the pack (${pack.id})` });
  if (!pack.leaderId) return jsonResponse(400, { error: `Pack ${pack.id} has no leader (demo pack): nothing to send` });
  if (!trusted && (await callerUid(request)) !== pack.leaderId) {
    return jsonResponse(403, { error: 'Only the pack\'s owning leader may send a test' });
  }
  const rows = testTo
    ? [testRecipientRow(pack.id, pack.leaderId, testTo, typeof body.test_name === 'string' ? body.test_name : 'Leader')]
    : await loadSignups(client, pack.id);
  const leaderId = verifyLeader(pack, rows);
  return sendAll(client, pack, leaderId, kind, rows, dryRun);
}

Deno.serve(async (request: Request) => {
  // The member's browser asks for the welcome email (and a leader's for a test), so it preflights first.
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') return preflightResponse(origin);
  try {
    return withCors(await handle(request), origin);
  } catch (err) {
    // Surfaced to the caller (pg_net response / leader page) as a 500 body, never swallowed.
    return withCors(jsonResponse(500, { error: err instanceof Error ? err.message : String(err) }), origin);
  }
});
