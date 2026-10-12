/**
 * admin.ts — fake admin RPCs for the e2e specs · 管理后台测试辅助 (ADR-0023)
 *
 * Same fake PostgREST base as the sign-up specs. The fake keeps the SQL's
 * rule (database/admin-portal-schema.sql): is_site_admin() answers `admin`,
 * and every admin_* function refuses with AD403 (HTTP 400, as PostgREST
 * returns an unknown SQLSTATE) unless `admin` — so a page that skipped its
 * own check would still get nothing. Replies are the unit tests' fixtures.
 */
import { Page } from '@playwright/test';
import { E2E_SUPABASE_PATH, injectSupabaseOverride } from './signup';
import {
  IS_SITE_ADMIN_FN, ADMIN_LEADERS_FN, ADMIN_FEEDBACK_FN, ADMIN_STATS_FN, ADMIN_DENIED_CODE,
} from '../../../components/admin/adminRules';
import { ADMIN_LEADERS, ADMIN_FEEDBACK, ADMIN_STATS } from '../../../components/admin/__tests__/adminFixtures';

export interface FakeAdminServer {
  /** Every RPC name called, in order. */
  calls: string[];
}

export async function mockAdminRpcs(page: Page, admin: boolean): Promise<FakeAdminServer> {
  await injectSupabaseOverride(page);
  const server: FakeAdminServer = { calls: [] };
  const replies: Record<string, unknown> = {
    [ADMIN_LEADERS_FN]: ADMIN_LEADERS, [ADMIN_FEEDBACK_FN]: ADMIN_FEEDBACK, [ADMIN_STATS_FN]: ADMIN_STATS,
  };
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${IS_SITE_ADMIN_FN}**`, route => {
    server.calls.push(IS_SITE_ADMIN_FN);
    return route.fulfill({ status: 200, json: admin });
  });
  for (const fn of Object.keys(replies)) {
    await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${fn}**`, route => {
      server.calls.push(fn);
      if (!admin) return route.fulfill({ status: 400, json: { code: ADMIN_DENIED_CODE, message: 'site admins only', details: null, hint: null } });
      return route.fulfill({ status: 200, json: replies[fn] });
    });
  }
  return server;
}
