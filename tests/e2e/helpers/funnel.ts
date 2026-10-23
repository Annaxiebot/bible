/**
 * funnel.ts — a fake log_funnel_event for the e2e specs · 漏斗计数测试辅助 (ADR-0025)
 *
 * Same fake PostgREST base as the sign-up specs. The fake keeps the SQL's
 * rules (database/funnel-schema.sql): an unknown event, an outcome without a
 * wait or outside 0..FUNNEL_MAX_WAIT_SECONDS, or a wait on any other event
 * answers 400 (Postgres' 22023); otherwise it records the call and answers
 * true. Each call keeps its Authorization header, so a spec can check it is
 * the anon key and never a session token (keepalive is not visible to
 * Playwright; the unit tests pin it).
 */
import { Page } from '@playwright/test';
import { E2E_SUPABASE_PATH, injectSupabaseOverride } from './signup';
import { LOG_FUNNEL_FN, FUNNEL_WAIT_EVENTS, FUNNEL_MAX_WAIT_SECONDS, isFunnelEvent } from '../../../components/stats/funnelRules';

export interface FunnelCall { p_event: string; p_wait_seconds: number | null; authorization: string | undefined }

export interface FakeFunnel {
  /** Every accepted count, in order. */
  calls: FunnelCall[];
  /** Calls the fake refused (as the SQL would). */
  refused: unknown[];
  /** The accepted event names, in order. */
  events: () => string[];
}

function valid(body: { p_event?: unknown; p_wait_seconds?: unknown }): boolean {
  if (!isFunnelEvent(body.p_event)) return false;
  const wait = body.p_wait_seconds;
  if (FUNNEL_WAIT_EVENTS.includes(body.p_event)) {
    return typeof wait === 'number' && Number.isInteger(wait) && wait >= 0 && wait <= FUNNEL_MAX_WAIT_SECONDS;
  }
  return wait === null || wait === undefined;
}

export async function mockFunnel(page: Page): Promise<FakeFunnel> {
  await injectSupabaseOverride(page);
  const fake: FakeFunnel = { calls: [], refused: [], events: () => fake.calls.map(c => c.p_event) };
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${LOG_FUNNEL_FN}**`, route => {
    const body = route.request().postDataJSON() as { p_event?: unknown; p_wait_seconds?: unknown };
    if (!valid(body)) {
      fake.refused.push(body);
      return route.fulfill({ status: 400, json: { code: '22023', message: 'invalid funnel event', details: null, hint: null } });
    }
    fake.calls.push({
      p_event: String(body.p_event), p_wait_seconds: (body.p_wait_seconds as number | null) ?? null,
      authorization: route.request().headers().authorization,
    });
    return route.fulfill({ status: 200, json: true });
  });
  return fake;
}
