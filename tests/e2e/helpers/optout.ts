/**
 * optout.ts — e2e fakes for the member's stop / resume RPCs · 退订测试辅助 (ADR-0009)
 *
 * Call after helpers/signup mockBackend (later routes win). Replicates
 * database/checkin-optout-schema.sql: unsubscribe_signup / resubscribe_signup
 * take exactly { p_id }, answer true for a known token (and flip its
 * state), false for an unknown one; anything else is PostgREST's 404
 * PGRST202 (no function with those arguments). checkin_context reports the
 * same state, so the check-in page and the stop page agree.
 */
import { Page } from '@playwright/test';
import { CHECKIN_CONTEXT_FN } from '../../../components/signup/signupSchema';
import { UNSUBSCRIBE_FN, RESUBSCRIBE_FN } from '../../../supabase/functions/send-checkins/optout';
import { E2E_SUPABASE_PATH, E2E_CHECKIN_CONTEXT } from './signup';

export interface OptOutMocks {
  calls: () => Array<{ fn: string; args: unknown }>;
  stoppedAt: (id: string) => string | null | undefined;
}

export async function mockOptOut(page: Page, known: Record<string, string | null>): Promise<OptOutMocks> {
  const state = new Map(Object.entries(known));
  const calls: Array<{ fn: string; args: unknown }> = [];
  const json = { 'Content-Type': 'application/json' };
  for (const fn of [UNSUBSCRIBE_FN, RESUBSCRIBE_FN]) {
    await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${fn}**`, route => {
      const args = route.request().postDataJSON() as Record<string, unknown>;
      calls.push({ fn, args });
      if (Object.keys(args).join() !== 'p_id' || typeof args.p_id !== 'string') {
        return route.fulfill({ status: 404, headers: json, body: JSON.stringify({ code: 'PGRST202', message: `no ${fn} with these arguments` }) });
      }
      if (!state.has(args.p_id)) return route.fulfill({ status: 200, headers: json, body: 'false' });
      state.set(args.p_id, fn === UNSUBSCRIBE_FN ? new Date().toISOString() : null);
      return route.fulfill({ status: 200, headers: json, body: 'true' });
    });
  }
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${CHECKIN_CONTEXT_FN}**`, route => {
    const id = (route.request().postDataJSON() as { p_signup_id: string }).p_signup_id;
    const rows = state.has(id) ? [{ ...E2E_CHECKIN_CONTEXT, unsubscribed_at: state.get(id) }] : [];
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify(rows) });
  });
  return { calls: () => calls, stoppedAt: id => state.get(id) };
}
