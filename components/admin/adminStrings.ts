/**
 * adminStrings.ts — every user-visible string of the admin portal · 管理后台文案 (ADR-0023)
 *
 * Single source (R3); Chinese first (ADR-0003 §1). Table headers are
 * bilingual() ("中文 English", split by splitLabel for the two-line header),
 * so the Chinese half never contains a space. Pure, so e2e specs import it.
 */
import { bilingual, bilingualLine } from '../studypack/principles';

/** The page title and the leader-home link text. */
export const AD_TITLE = bilingualLine('管理', 'Admin');
export function ownerOnlyLine(email: string | null): string {
  return `${bilingualLine('仅限网站管理员', 'Site owner only')}${email ? ` — ${email}` : ''}`;
}
export const AD_DENIED = bilingualLine('仅限管理员', 'Admins only');
export const AD_CHECKING = bilingualLine('核对权限中', 'Checking access');
export const AD_LOADING = bilingualLine('读取中', 'Loading');
export const AD_ERR_CHECK = bilingualLine('无法核对管理员权限', 'Could not check admin access');
export const AD_ERR_LOAD = bilingualLine('读取管理数据失败', 'Could not load the admin data');

// ---- tabs ----
export const AD_TAB_LEADERS = bilingual('带领者', 'Leaders');
export const AD_TAB_FEEDBACK = bilingual('意见反馈', 'Feedback');
export const AD_TAB_STATS = bilingual('统计', 'Stats');

// ---- leaders ----
export const AD_SEARCH = bilingual('搜索带领者：姓名或邮箱', 'Search: name or email');
export const AD_SEARCH_NONE = bilingualLine('没有找到', 'No matching leaders');
export const AD_NO_LEADERS = bilingualLine('还没有带领者', 'No leaders yet');
export const AD_COL_JOINED = bilingual('加入', 'Joined');
export const AD_COL_LAST = bilingual('最近登录', 'Last sign-in');
export const AD_COL_STUDIES = bilingual('查经', 'Studies');
export const AD_COL_SIGNUPS = bilingual('报名', 'Sign-ups');
export const AD_COL_SHARED = bilingual('分享', 'Shared');
export const AD_COL_ASK = bilingual('本月问一问', 'Ask AI this month');
/** A leader with no name on the Google account. */
export const AD_NO_NAME = bilingual('（无名字）', '(no name)');
/** The totals row: one figure per column that has a sum. */
export const AD_TOTALS = [
  { key: 'leaders', zh: '带领者', en: 'Leaders' },
  { key: 'studies', zh: '查经', en: 'Studies' },
  { key: 'signups', zh: '报名', en: 'Sign-ups' },
  { key: 'shared', zh: '分享', en: 'Shared' },
  { key: 'askAi', zh: '本月问一问', en: 'Ask AI this month' },
] as const;

// ---- feedback ----
export const AD_FEEDBACK_NONE = bilingualLine('还没有反馈', 'No feedback yet');
export const AD_REPLY_TO = bilingualLine('回复', 'Reply to');
export const AD_FEEDBACK_PACK = bilingualLine('查经包', 'Study');

// ---- stats ----
export const AD_STAT_EXTRA = [
  { key: 'accounts', zh: '登录账号', en: 'Signed-in accounts' },
  { key: 'active_leaders', zh: '本月活跃带领者', en: 'Active leaders this month' },
] as const;
export const AD_ACTIVE_NOTE = bilingualLine(
  '本月（洛杉矶时间）登录过、保存过查经或用过本站 AI 的账号',
  'Accounts that signed in, saved a study or used the site\'s AI this month (Los Angeles time)',
);
