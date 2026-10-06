/**
 * welcome.ts — the signup function asks send-checkins for the welcome · 报名确认邮件请求
 *
 * Server to server: the signup function is the only caller of the welcome
 * path (send-checkins refuses an anonymous welcome since ADR-0013). It
 * proves itself with the trusted-caller header (x-checkin-secret =
 * CHECKIN_CRON_SECRET, send-checkins/trust.ts) and passes the gateway with
 * the anon key. Pure apart from the injected fetch, so vitest checks the
 * exact request and every way the answer can go wrong.
 */
import { CRON_SECRET_HEADER } from '../send-checkins/trust.ts';
import { SEND_CHECKINS_SLUG } from '../send-checkins/optout.ts';
import { WELCOME_KIND } from '../send-checkins/templates.ts';

export interface WelcomeConfig {
  supabaseUrl: string;
  anonKey: string;
  cronSecret: string;
}

export type WelcomeOutcome = { status: 'sent' } | { status: 'skipped'; message: string } | { status: 'failed'; message: string };

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

/** The one request: POST <SUPABASE_URL>/functions/v1/send-checkins with the trusted header. */
export function welcomeRequest(config: WelcomeConfig, signupId: string): { url: string; init: RequestInit } {
  return {
    url: `${config.supabaseUrl.replace(/\/+$/, '')}/functions/v1/${SEND_CHECKINS_SLUG}`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        [CRON_SECRET_HEADER]: config.cronSecret,
      },
      body: JSON.stringify({ kind: WELCOME_KIND, signup_id: signupId }),
    },
  };
}

interface WelcomeReply {
  attempted?: unknown;
  skipped?: unknown;
  results?: Array<{ status?: unknown; error?: unknown }>;
  error?: unknown;
}

/**
 * send-checkins' answer → sent; skipped when it deliberately sent nothing
 * (site pause, or the member unticked check-ins: one skipped row); failed
 * with the reason otherwise.
 */
export function welcomeVerdict(status: number, reply: WelcomeReply | null): WelcomeOutcome {
  if (status < 200 || status >= 300) return { status: 'failed', message: `HTTP ${status}: ${String(reply?.error ?? JSON.stringify(reply))}` };
  if (typeof reply?.skipped === 'string') return { status: 'skipped', message: reply.skipped };
  const failed = reply?.results?.find(r => r.status === 'failed');
  if (failed) return { status: 'failed', message: String(failed.error ?? failed.status) };
  if (reply?.attempted === 1) return { status: 'sent' };
  const skips = Array.isArray(reply?.skipped) ? (reply.skipped as Array<{ reason?: unknown }>) : [];
  if (reply?.attempted === 0 && skips.length === 1) return { status: 'skipped', message: String(skips[0].reason) };
  return { status: 'failed', message: JSON.stringify(reply) };
}

/** Ask for the welcome; every failure (config, network, refusal) comes back as 'failed' with its reason. */
export async function requestWelcome(fetchFn: FetchFn, config: WelcomeConfig, signupId: string): Promise<WelcomeOutcome> {
  if (!config.cronSecret) return { status: 'failed', message: 'CHECKIN_CRON_SECRET is not set' };
  if (!config.supabaseUrl || !config.anonKey) return { status: 'failed', message: 'SUPABASE_URL / SUPABASE_ANON_KEY is not set' };
  const { url, init } = welcomeRequest(config, signupId);
  try {
    const response = await fetchFn(url, init);
    const reply = (await response.json().catch(() => null)) as WelcomeReply | null;
    return welcomeVerdict(response.status, reply);
  } catch (err) {
    // Surfaced, not swallowed: the sign-up is stored, so the page shows this reason under the thank-you.
    return { status: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
