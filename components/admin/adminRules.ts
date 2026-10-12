/**
 * adminRules.ts — the admin portal's names, shapes and helpers · 管理后台规则 (ADR-0023)
 *
 * Single source (R3) for the page, the schema test and the e2e mocks: the
 * RPC names in database/admin-portal-schema.sql, the refusal code its guard
 * raises, the row shapes and the small pure helpers (source label, search
 * text, totals). Pure: no React, no client, so Playwright specs load it; the
 * strict reply parsers are adminParse.
 */
import type { SiteStats } from '../stats/statsRules';
import {
  FEEDBACK_SOURCE_LABELS, FEEDBACK_SOURCE_UNKNOWN, type FeedbackContext,
} from '../../supabase/functions/_shared/feedback';

export const IS_SITE_ADMIN_FN = 'is_site_admin';
export const ADMIN_LEADERS_FN = 'admin_leaders';
export const ADMIN_FEEDBACK_FN = 'admin_feedback';
export const ADMIN_STATS_FN = 'admin_stats';
/** Every admin_* function, in the order the page reads them. */
export const ADMIN_DATA_FNS = [ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN] as const;

/** SQLSTATE the guard raises when the caller is not in site_admins. */
export const ADMIN_DENIED_CODE = 'AD403';

export interface AdminLeader {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  studies: number;
  signups: number;
  shared: number;
  ask_ai_month: number;
}

export interface AdminFeedback {
  id: string;
  message: string;
  email: string | null;
  context: FeedbackContext;
  created_at: string;
}

/** admin_stats() keys beyond site_stats(). */
export const ADMIN_EXTRA_STATS_KEYS = ['accounts', 'active_leaders'] as const;
export type AdminStats = SiteStats & Record<typeof ADMIN_EXTRA_STATS_KEYS[number], number> & { month_start: string };

/** Column order of admin_leaders() (pinned to the SQL by the schema test). */
export const ADMIN_LEADER_COLUMNS: readonly (keyof AdminLeader)[] = [
  'id', 'email', 'full_name', 'created_at', 'last_sign_in_at', 'studies', 'signups', 'shared', 'ask_ai_month',
];
export const ADMIN_FEEDBACK_COLUMNS: readonly (keyof AdminFeedback)[] = ['id', 'message', 'email', 'context', 'created_at'];

/** The bilingual label of a message's source. */
export function feedbackSourceLabel(context: FeedbackContext): string {
  return context.from ? FEEDBACK_SOURCE_LABELS[context.from] : FEEDBACK_SOURCE_UNKNOWN;
}

/** The text a leaders search matches: name and email. */
export function leaderSearchText(leader: AdminLeader): string {
  return `${leader.full_name ?? ''} ${leader.email ?? ''}`;
}

/** Sums over the leaders list for the totals row. */
export function leaderTotals(leaders: readonly AdminLeader[]) {
  const sum = (key: 'studies' | 'signups' | 'shared' | 'ask_ai_month') => leaders.reduce((n, l) => n + l[key], 0);
  return { leaders: leaders.length, studies: sum('studies'), signups: sum('signups'), shared: sum('shared'), askAi: sum('ask_ai_month') };
}
