/**
 * welcomeEmail.ts — the confirmation sent right after sign-up · 报名确认邮件
 *
 * The browser asks the send-checkins edge function for kind 'welcome' with
 * the new signup id; the function (service role inside) restates the
 * member's practice and carries their personal check-in link. The anon
 * call is accepted only for 'welcome' + a signup created in the last
 * WELCOME_WINDOW_MINUTES (enforced server-side, never here). A failure is
 * returned, not thrown: the thank-you still shows, with the reason.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { CK_WELCOME_FAILED } from '../checkin/checkinStrings';
import { SEND_CHECKINS_FUNCTION } from './signupSchema';

export const WELCOME_KIND = 'welcome';

export type WelcomeResult = { status: 'sent' } | { status: 'skipped' } | { status: 'failed'; message: string };

interface WelcomeReply {
  attempted?: number;
  results?: Array<{ status: string; error?: string }>;
}

/** Nothing to send without an email; otherwise one function call, its verdict returned. */
export async function sendWelcome(client: SupabaseClient, signupId: string, email: string | null): Promise<WelcomeResult> {
  if (!email) return { status: 'skipped' };
  const { data, error } = await client.functions.invoke<WelcomeReply>(SEND_CHECKINS_FUNCTION, {
    body: { kind: WELCOME_KIND, signup_id: signupId },
  });
  if (error) return { status: 'failed', message: `${CK_WELCOME_FAILED}: ${error.message}` };
  const failed = data?.results?.find(r => r.status === 'failed');
  if (failed) return { status: 'failed', message: `${CK_WELCOME_FAILED}: ${failed.error ?? failed.status}` };
  if (!data || data.attempted !== 1) return { status: 'failed', message: `${CK_WELCOME_FAILED}: ${JSON.stringify(data)}` };
  return { status: 'sent' };
}
