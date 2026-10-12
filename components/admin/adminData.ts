/**
 * adminData.ts — the admin portal's reads · 管理后台数据 (ADR-0023)
 *
 * Two hooks over the signed-in client (getSignupClient — the app's Supabase
 * client in production, the dev-only e2e base in Playwright):
 *   useIsSiteAdmin(uid) — one is_site_admin() call; the leader home shows
 *     the Admin link and #/admin decides whether to read anything at all.
 *   useAdminData() — admin_leaders, admin_feedback and admin_stats in
 *     parallel; the page mounts it only once the caller is known to be an admin. The database
 *     refuses anyone else anyway (AD403 → 'denied').
 * Nothing is cached or stored: every visit reads fresh (ADR-0023 privacy).
 */
import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSignupClient } from '../signup/signupClient';
import {
  IS_SITE_ADMIN_FN, ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN, ADMIN_DENIED_CODE,
  type AdminLeader, type AdminFeedback, type AdminStats,
} from './adminRules';
import { parseAdminLeaders, parseAdminFeedback, parseAdminStats } from './adminParse';

export type AdminCheck = { status: 'checking' } | { status: 'yes' } | { status: 'no' } | { status: 'failed'; message: string };

export interface AdminData { leaders: AdminLeader[]; feedback: AdminFeedback[]; stats: AdminStats }
export type AdminDataState =
  | { status: 'loading' } | { status: 'denied' }
  | { status: 'ready'; data: AdminData } | { status: 'failed'; message: string };

/** The database's refusal (the guard's AD403), as opposed to any other failure. */
export class AdminDeniedError extends Error {}

const NOT_CONFIGURED = 'not configured';
const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function callRpc(client: SupabaseClient, fn: string): Promise<unknown> {
  const { data, error } = await client.rpc(fn);
  if (error?.code === ADMIN_DENIED_CODE) throw new AdminDeniedError(error.message);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

/** True only when the database says the caller is an admin; throws on any failure. */
export async function fetchIsSiteAdmin(client: SupabaseClient): Promise<boolean> {
  const data = await callRpc(client, IS_SITE_ADMIN_FN);
  if (typeof data !== 'boolean') throw new Error(`${IS_SITE_ADMIN_FN}: unexpected reply ${JSON.stringify(data)}`);
  return data;
}

/** The three admin reads in parallel; throws AdminDeniedError when the database refuses. */
export async function fetchAdminData(client: SupabaseClient): Promise<AdminData> {
  const [leaders, feedback, stats] = await Promise.all([
    callRpc(client, ADMIN_LEADERS_FN), callRpc(client, ADMIN_FEEDBACK_FN), callRpc(client, ADMIN_STATS_FN),
  ]);
  return { leaders: parseAdminLeaders(leaders), feedback: parseAdminFeedback(feedback), stats: parseAdminStats(stats) };
}

/** Is the signed-in caller an admin? Signed out or unconfigured → 'no' without a request. */
export function useIsSiteAdmin(uid: string | null): AdminCheck {
  const [check, setCheck] = useState<AdminCheck>({ status: 'checking' });
  useEffect(() => {
    const client = getSignupClient();
    if (!uid || !client) { setCheck({ status: 'no' }); return; }
    let cancelled = false;
    setCheck({ status: 'checking' });
    fetchIsSiteAdmin(client)
      .then(yes => { if (!cancelled) setCheck({ status: yes ? 'yes' : 'no' }); })
      .catch((err: unknown) => { if (!cancelled) setCheck({ status: 'failed', message: describe(err) }); });
    return () => { cancelled = true; };
  }, [uid]);
  return check;
}

/** The portal's data; mount it only once the caller is known to be an admin. */
export function useAdminData(): AdminDataState {
  const [state, setState] = useState<AdminDataState>({ status: 'loading' });
  useEffect(() => {
    const client = getSignupClient();
    if (!client) { setState({ status: 'failed', message: NOT_CONFIGURED }); return; }
    let cancelled = false;
    fetchAdminData(client)
      .then(data => { if (!cancelled) setState({ status: 'ready', data }); })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState(err instanceof AdminDeniedError ? { status: 'denied' } : { status: 'failed', message: describe(err) });
      });
    return () => { cancelled = true; };
  }, []);
  return state;
}
