/**
 * caps.ts — which monthly limit a caller gets, and the site-wide daily cap · 用量上限
 *
 * Pure (no Deno, no fetch), tested under vitest (ADR-0007 "Caps", 2026-10-23).
 * - The site's owner (and any admin: is_site_admin() answers "admin or
 *   above", ADR-0023/0024) gets a higher monthly limit per role: the secret
 *   AI_MONTHLY_<ROLE>_OWNER when set, else ten times the leader default
 *   (AI_MONTHLY_PACK_OWNER → 100). Never less than a leader's own limit.
 * - A site-wide cap per UTC day on pack generations (AI_DAILY_PACK_CAP,
 *   default 30), counted for everyone by consume_ai_quota_daily
 *   (database/ai-daily-cap-schema.sql) in the same transaction as the
 *   leader's monthly count, so a refused call never spends either.
 */
import { AIRole, DEFAULT_MONTHLY_LIMITS, MONTHLY_LIMIT_SECRET, monthlyLimit } from './policy.ts';

/** = components/admin/adminRules IS_SITE_ADMIN_FN (pinned): the caller-scoped "admin or above" check. */
export const IS_SITE_ADMIN_FUNCTION = 'is_site_admin';
/** database/ai-daily-cap-schema.sql (pinned by database/__tests__/aiDailyCapSchema.test.ts). */
export const DAILY_QUOTA_FUNCTION = 'consume_ai_quota_daily';
export const SITE_DAILY_TABLE = 'ai_site_daily';

/** The owner's default per role = this × the leader default. */
export const OWNER_LIMIT_MULTIPLIER = 10;
const OWNER_SECRET_SUFFIX = '_OWNER';

/** AI_MONTHLY_PACK → AI_MONTHLY_PACK_OWNER, per role. */
export function ownerLimitSecret(role: AIRole): string {
  return `${MONTHLY_LIMIT_SECRET[role]}${OWNER_SECRET_SUFFIX}`;
}

function secretInt(env: (name: string) => string, name: string): number | null {
  const raw = env(name).trim();
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

/** The monthly limit for this caller: a leader's, or the owner's/admin's (never below the leader's). */
export function callerMonthlyLimit(role: AIRole, isAdmin: boolean, env: (name: string) => string): number {
  const leader = monthlyLimit(role, env);
  if (!isAdmin) return leader;
  const owner = secretInt(env, ownerLimitSecret(role)) ?? DEFAULT_MONTHLY_LIMITS[role] * OWNER_LIMIT_MULTIPLIER;
  return Math.max(owner, leader);
}

/** Roles under the site-wide daily cap, with the secret and default of each. */
export const DAILY_CAPS: Readonly<Partial<Record<AIRole, { secret: string; fallback: number }>>> = {
  pack: { secret: 'AI_DAILY_PACK_CAP', fallback: 30 },
};

/** Today's site-wide cap for the role; null when the role has none. */
export function dailyCap(role: AIRole, env: (name: string) => string): number | null {
  const cap = DAILY_CAPS[role];
  if (!cap) return null;
  return secretInt(env, cap.secret) ?? cap.fallback;
}

/** What consume_ai_quota_daily returns instead of a count. */
export const QUOTA_RESULT = { monthlyFull: -1, dailyFull: -2 } as const;
