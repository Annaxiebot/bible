/**
 * checkinStrings.ts — every user-visible string of the check-in page · 跟进文案
 *
 * Single source (R3); Chinese first (ADR-0003 §1). Pure module so the e2e
 * specs import it.
 */
import { bilingual, bilingualLine } from '../studypack/principles';
import type { CheckinKind } from './checkinRoute';

export const CK_TITLE = bilingual('周中跟进', 'Mid-week check-in');
export const CK_LOADING = bilingualLine('载入中', 'loading');
export const CK_ERR_LOAD = bilingualLine('找不到这个跟进链接', 'This check-in link could not be found');
export const CK_PRACTICE_LABEL = bilingual('你本周的操练', 'Your practice this week');
export const CK_QUESTION_LABEL = bilingual('这次的问题', 'This time');
/** Used when the pack summary has no prompt line for the kind (summary never synced). */
export const CK_DEFAULT_QUESTION = bilingualLine('操练做了吗？有什么改变？', 'Did it happen? What changed?');
export const CK_ANSWER = bilingual('一两句就好', 'A line or two is enough');
export const CK_KEEP_PRIVATE = bilingual('只记在我的手机', 'Keep private');
export const CK_SHARE = bilingual('分享给组长', 'Share with leader');
export const CK_SHARING = bilingual('发送中…', 'Sending…');
export const CK_KEPT = bilingualLine('已记在这台设备上，不会发送', 'Kept on this device only; nothing was sent');
export const CK_SHARED = bilingualLine('已分享给组长，谢谢', 'Shared with your leader, thank you');
export const CK_ERR_EMPTY = bilingualLine('请先写一两句', 'Please write a line first');
export const CK_ERR_SHARE = bilingualLine('分享失败', 'Sharing failed');
export const CK_PRIVACY = bilingualLine(
  '反思默认私密：只有按「分享给组长」才会发送；组长可能借助AI把大家分享的内容整理成不具名的摘要',
  'Reflections are private by default: only "Share with leader" sends anything; your leader may use AI to turn shared answers into an anonymous summary'
);
/** Thank-you page: the member's personal check-in link. */
export const CK_YOUR_LINK = bilingualLine('你的跟进链接（周中也会发到你的邮箱）', 'Your check-in link (also emailed mid-week)');
export const CK_WELCOME_FAILED = bilingualLine('确认邮件未发出', 'Confirmation email not sent');

export const CK_KIND_LABEL: Record<CheckinKind, string> = {
  tue: bilingual('周二跟进', 'Tuesday check-in'),
  thu: bilingual('周四跟进', 'Thursday check-in'),
  weekend: bilingual('周末回顾', 'Weekend reflection'),
};

// ---- stop / resume (ADR-0009) ----
export const CK_STOP = bilingualLine('停止提醒', 'Stop these emails');
export const CK_STOP_BUSY = bilingualLine('处理中…', 'Working…');
export const CK_STOPPED = bilingualLine('已停止本次查经的提醒', 'Reminders for this study are stopped');
export const CK_RESUME = bilingualLine('恢复', 'Resume');
export const CK_RESUMED = bilingualLine('已恢复本次查经的提醒', 'Reminders for this study are back on');
export const CK_ERR_STOP = bilingualLine('操作失败，请再试一次', 'That did not work, please try again');
