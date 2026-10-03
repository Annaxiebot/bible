/**
 * aiUsage.ts — this month's hosted-AI usage for the status line · 本月用量
 *
 * Reads the signed-in leader's ai_usage rows (database/ai-usage-schema.sql;
 * RLS lets a leader SELECT their own rows only, and the query filters by uid
 * as well). The month key is UTC 'YYYY-MM', the same one consume_ai_quota
 * writes. A role never used this month shows 0/<default limit>; once used,
 * the row carries the limit the server applied. Ask and pack always show;
 * adjust and sharing once they have a row. A failed read is surfaced (R5).
 */
import { useEffect, useState } from 'react';
import { getSignupClient } from '../signup/signupClient';
import { AI_USAGE_TABLE, DEFAULT_MONTHLY_LIMITS, AIRole, isAIRole } from '../../supabase/functions/ai-proxy/policy';
import { UsageEntry } from './setupStrings';

const ALWAYS_SHOWN: readonly AIRole[] = ['ask', 'pack'];
const ROLE_ORDER: readonly AIRole[] = ['ask', 'pack', 'adjust', 'sharing'];

/** UTC 'YYYY-MM' — the consume_ai_quota month (pinned by database/__tests__/aiUsageSchema.test.ts). */
export function currentUsageMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

interface UsageRow { role: string; count: number; monthly_limit: number | null }

/** Rows → the entries the line shows, in role order. */
export function usageEntries(rows: readonly UsageRow[]): UsageEntry[] {
  const byRole = new Map<AIRole, UsageRow>();
  for (const row of rows) if (isAIRole(row.role)) byRole.set(row.role, row);
  return ROLE_ORDER.filter(role => ALWAYS_SHOWN.includes(role) || byRole.has(role)).map(role => {
    const row = byRole.get(role);
    return { role, count: row?.count ?? 0, limit: row?.monthly_limit ?? DEFAULT_MONTHLY_LIMITS[role] };
  });
}

/** This month's entries for `uid`; throws with the PostgREST message on failure. */
export async function fetchAIUsage(uid: string, now: Date = new Date()): Promise<UsageEntry[]> {
  const client = getSignupClient();
  if (!client) return usageEntries([]);
  const { data, error } = await client.from(AI_USAGE_TABLE)
    .select('role, count, monthly_limit')
    .eq('leader_id', uid)
    .eq('month', currentUsageMonth(now));
  if (error) throw new Error(error.message);
  return usageEntries((data ?? []) as UsageRow[]);
}

export type AIUsageState =
  | { status: 'loading' }
  | { status: 'ready'; entries: UsageEntry[] }
  | { status: 'failed'; message: string };

export function useAIUsage(uid: string): AIUsageState {
  const [state, setState] = useState<AIUsageState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    fetchAIUsage(uid)
      .then(entries => { if (live) setState({ status: 'ready', entries }); })
      .catch((err: unknown) => {
        // Surfaced: the status line renders it as a red line with the server message.
        if (live) setState({ status: 'failed', message: err instanceof Error ? err.message : String(err) });
      });
    return () => { live = false; };
  }, [uid]);
  return state;
}
