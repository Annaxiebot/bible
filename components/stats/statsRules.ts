/**
 * statsRules.ts — site-wide usage counters: names, rules, labels · 全站统计规则 (ADR-0012)
 *
 * Single source (R3) for the client (siteStats, useMeetingTracker, the
 * leader-home and landing displays), the schema test and the e2e mocks.
 * Pure, no imports beyond the bilingual helpers, so Playwright specs load it.
 * The SQL (database/site-stats-schema.sql) repeats the meeting limits and the
 * keys; database/__tests__/siteStatsSchema.test.ts pins them equal.
 */
import { bilingualLine } from '../studypack/principles';
import { BRAND_ZH } from '../landing/landingStrings';

export const SITE_STATS_FN = 'site_stats';
export const LOG_PRESENTATION_FN = 'log_presentation';

/** A TV presentation counts as a meeting after this much VISIBLE time. */
export const MEETING_MIN_SECONDS = 600;
/** The server refuses a longer claim (6 hours). */
export const MEETING_MAX_SECONDS = 6 * 60 * 60;
/** The server records at most one meeting per pack in this window. */
export const MEETING_RATE_HOURS = 2;

/** The landing shows live numbers only once this many leaders have a pack. */
export const PUBLIC_STATS_MIN_LEADERS = 10;

/** Every count site_stats() returns (plus as_of) — totals only, never a breakdown. */
export const SITE_STATS_KEYS = ['packs', 'leaders', 'meetings', 'signups', 'practices', 'checkins_shared'] as const;
export type SiteStatKey = typeof SITE_STATS_KEYS[number];

export type SiteStats = Record<SiteStatKey, number> & { as_of: string };

export interface StatFigure { key: SiteStatKey; zh: string; en: string }

/** Display order, Chinese first. The last two are the "living the Word" figures. */
export const SITE_STAT_FIGURES: readonly StatFigure[] = [
  { key: 'packs', zh: '查经包', en: 'Study packs' },
  { key: 'leaders', zh: '带领者', en: 'Leaders' },
  { key: 'meetings', zh: '小组聚会', en: 'Meetings' },
  { key: 'signups', zh: '报名', en: 'Sign-ups' },
  { key: 'practices', zh: '选择的操练', en: 'Practices chosen' },
  { key: 'checkins_shared', zh: '分享的跟进', en: 'Check-ins shared' },
];
/** Keys shown under the "living the Word" caption. */
export const LIVING_KEYS: readonly SiteStatKey[] = ['practices', 'checkins_shared'];

export const STATS_TITLE = bilingualLine('全站使用', 'Site-wide');
export const STATS_LIVING = bilingualLine(BRAND_ZH, 'Living the Word');
export const STATS_LOADING = bilingualLine('读取全站统计中', 'Loading site-wide numbers');
export const STATS_FAILED = bilingualLine('全站统计暂时无法读取', 'Site-wide numbers are unavailable right now');

// ---- landing live variant (shown only at/above PUBLIC_STATS_MIN_LEADERS) ----
export const LIVE_NUMBERS_EYEBROW = STATS_TITLE;
export const LIVE_NUMBERS_HEADING_ZH = '一同活出神的话';
export const LIVE_NUMBERS_HEADING_EN = 'Living the Word together';
export const LIVE_NUMBERS_DESC = bilingualLine('全站累计总数，不含任何个人信息', 'Site-wide totals — no names, no personal details');

/** True when the totals are large enough to show publicly on the landing. */
export function isPublicWorthy(stats: Pick<SiteStats, 'leaders'>): boolean {
  return stats.leaders >= PUBLIC_STATS_MIN_LEADERS;
}
