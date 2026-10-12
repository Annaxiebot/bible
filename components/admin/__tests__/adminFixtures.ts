/**
 * adminFixtures.ts — admin RPC replies shaped like the SQL's · 管理后台测试数据
 *
 * Shared by the unit tests (and the e2e helper) so a reply shape lives once.
 * Nine leaders (≥ LIST_SEARCH_FROM, so the search box shows), joined on
 * successive days; two feedback rows (one with a reply-to email and a pack).
 */
import type { AdminLeader, AdminFeedback, AdminStats } from '../adminRules';

export const OWNER_EMAIL = 'owner@example.com';

const NAMES = ['Anna Xie', '王明', 'Ruth Lee', 'Paul Kim', null, 'Mary Chen', 'John Wu', 'Grace Li', 'Peter Zhao'];

export const ADMIN_LEADERS: AdminLeader[] = NAMES.map((name, i) => ({
  id: `00000000-0000-4000-8000-00000000000${i}`,
  email: i === 0 ? OWNER_EMAIL : `leader${i}@example.org`,
  full_name: name,
  created_at: `2026-10-0${i + 1}T22:12:00.000Z`,
  last_sign_in_at: i === 4 ? null : `2026-10-10T1${i}:05:00.000Z`,
  studies: i, signups: i * 2, shared: i === 2 ? 3 : 0, ask_ai_month: i === 1 ? 7 : 0,
}));

export const ADMIN_FEEDBACK: AdminFeedback[] = [
  { id: 'f-old', message: 'Older note', email: null, context: {}, created_at: '2026-10-05T10:00:00.000Z' },
  { id: 'f-new', message: '字太小了\nFont too small', email: 'member@example.org', context: { from: 'tv', pack: 'local-2026-10-09-jhn3' }, created_at: '2026-10-10T10:00:00.000Z' },
];

export const ADMIN_STATS: AdminStats = {
  packs: 12, leaders: 5, meetings: 4, signups: 30, practices: 41, checkins_shared: 9, as_of: '2026-10-11T00:00:00Z',
  accounts: 9, active_leaders: 3, month_start: '2026-10-01T07:00:00Z',
};
