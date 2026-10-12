/**
 * adminParse.ts — strict parsers for the admin RPC replies · 管理后台数据解析 (ADR-0023)
 *
 * A reply of the wrong shape throws (the page shows the message, R5); it is
 * never turned into a silently empty or partial list. Feedback context is
 * cleaned to the known fields (feedback.ts cleanContext). admin_stats reuses
 * site_stats' parser for its first six totals.
 */
import { parseSiteStats } from '../stats/siteStats';
import { cleanContext } from '../../supabase/functions/_shared/feedback';
import {
  ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN,
  type AdminLeader, type AdminFeedback, type AdminStats,
} from './adminRules';

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const textOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

function parseLeader(value: unknown): AdminLeader | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  const { studies, signups, shared, ask_ai_month } = r;
  if (typeof r.id !== 'string' || typeof r.created_at !== 'string') return null;
  if (!isCount(studies) || !isCount(signups) || !isCount(shared) || !isCount(ask_ai_month)) return null;
  if (!textOrNull(r.email) || !textOrNull(r.full_name) || !textOrNull(r.last_sign_in_at)) return null;
  return {
    id: r.id, email: r.email, full_name: r.full_name, created_at: r.created_at, last_sign_in_at: r.last_sign_in_at,
    studies, signups, shared, ask_ai_month,
  };
}

function parseFeedbackRow(value: unknown): AdminFeedback | null {
  if (typeof value !== 'object' || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.message !== 'string' || typeof r.created_at !== 'string' || !textOrNull(r.email)) return null;
  return { id: r.id, message: r.message, email: r.email, context: cleanContext(r.context), created_at: r.created_at };
}

function parseList<T>(value: unknown, one: (v: unknown) => T | null, what: string): T[] {
  if (!Array.isArray(value)) throw new Error(`${what}: unexpected reply ${JSON.stringify(value)}`);
  return value.map(v => {
    const row = one(v);
    if (!row) throw new Error(`${what}: unexpected row ${JSON.stringify(v)}`);
    return row;
  });
}

/** admin_leaders() rows; throws on any malformed row. */
export function parseAdminLeaders(value: unknown): AdminLeader[] {
  return parseList(value, parseLeader, ADMIN_LEADERS_FN);
}

/** admin_feedback() rows (context cleaned to the known fields); throws on any malformed row. */
export function parseAdminFeedback(value: unknown): AdminFeedback[] {
  return parseList(value, parseFeedbackRow, ADMIN_FEEDBACK_FN);
}

/** admin_stats() jsonb; throws when a count is missing. */
export function parseAdminStats(value: unknown): AdminStats {
  const base = parseSiteStats(value);
  const row = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const { accounts, active_leaders } = row;
  if (!base || !isCount(accounts) || !isCount(active_leaders)) {
    throw new Error(`${ADMIN_STATS_FN}: unexpected reply ${JSON.stringify(value)}`);
  }
  return { ...base, accounts, active_leaders, month_start: typeof row.month_start === 'string' ? row.month_start : '' };
}
