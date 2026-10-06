/**
 * signupRateGuard.ts — the study_signups rate-guard trigger, for fakes · 报名限流触发器（测试替身）
 *
 * The caps and messages are read from database/signup-interim-guard.sql
 * itself (one copy, R3), so the vitest store and the e2e mock refuse
 * exactly what signup_rate_guard() refuses: at most per_pack_hour rows per
 * pack in the last hour, at most per_email_day per pack + lower(trim(email))
 * in the last day. Test-only; Node (fs) — vitest and Playwright both load it.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.resolve(here, '../../database/signup-interim-guard.sql'), 'utf-8');

function constant(name: string): number {
  const match = new RegExp(`${name} CONSTANT INTEGER := (\\d+);`).exec(sql);
  if (!match) throw new Error(`signup-interim-guard.sql: ${name} not found`);
  return Number(match[1]);
}

/** RAISE EXCEPTION '<message>' lines, in order: per pack (hour), then per email (day). */
const messages = [...sql.matchAll(/RAISE EXCEPTION '([^']+)'/g)].map(m => m[1]);

export const RATE_GUARD_PER_PACK_HOUR = constant('per_pack_hour');
export const RATE_GUARD_PER_EMAIL_DAY = constant('per_email_day');
export const RATE_GUARD_PACK_MESSAGE = messages[0];
export const RATE_GUARD_EMAIL_MESSAGE = messages[1];

const HOUR_MS = 60 * 60 * 1000;
const key = (email: string | null) => (email ?? '').trim().toLowerCase();

interface GuardRow { pack_id: string; email: string | null; created_at: string }

/** The trigger's verdict for a new row against the stored ones: null (allowed) or its message. */
export function rateGuardRefusal(rows: readonly GuardRow[], next: { pack_id: string; email: string | null }, now: Date): string | null {
  const after = (ms: number) => (r: GuardRow) => new Date(r.created_at).getTime() > now.getTime() - ms;
  const pack = rows.filter(r => r.pack_id === next.pack_id);
  if (pack.filter(after(HOUR_MS)).length >= RATE_GUARD_PER_PACK_HOUR) return RATE_GUARD_PACK_MESSAGE;
  if (next.email !== null && pack.filter(r => key(r.email) === key(next.email)).filter(after(24 * HOUR_MS)).length >= RATE_GUARD_PER_EMAIL_DAY) {
    return RATE_GUARD_EMAIL_MESSAGE;
  }
  return null;
}
