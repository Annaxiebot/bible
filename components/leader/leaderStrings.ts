/**
 * leaderStrings.ts — every user-visible string of the leader list · 组长文案
 *
 * Single source (R3); Chinese first (ADR-0003 §1). Pure module so e2e
 * specs can import it.
 */
import { bilingual, bilingualLine } from '../studypack/principles';

export const LD_TITLE = bilingual('报名名单', 'Sign-ups');
export const LD_SIGNIN = bilingualLine('组长请先登录，才能查看名单', 'Leaders, please sign in to see the list');
export const LD_LOADING = bilingualLine('读取名单中', 'Loading the sign-ups');
export const LD_NONE = bilingualLine('还没有人报名', 'No sign-ups yet');
export const LD_ERR_LOAD = bilingualLine('读取名单失败', 'Could not load the sign-ups');
export const LD_NOT_OWNER = bilingualLine('这不是你的查经包', 'Not your pack');

export function countLine(n: number): string {
  return bilingualLine(`共 ${n} 人`, `${n} signed up`);
}

// ---- table ----
export const LD_COL_NAME = bilingual('姓名', 'Name');
export const LD_COL_PHONE = bilingual('手机', 'Phone');
export const LD_COL_EMAIL = bilingual('邮箱', 'Email');
export const LD_COL_CONSENT = bilingual('提醒', 'Check-ins');
export const LD_COL_TIME = bilingual('时间', 'Time');
export const LD_YES = bilingual('是', 'Yes');
export const LD_NO = bilingual('否', 'No');

// ---- commitments + shared feedback (ADR-0004 §7) ----
export const LD_COMMITMENTS = bilingual('承诺', 'Commitments');
export const LD_COMMITMENTS_HINT = bilingualLine('每人本周选的操练；下周五的闭环从这里来', 'Each member\'s practice this week; next Friday\'s closing starts here');
export const LD_COL_PRACTICE = bilingual('操练', 'Practice');
export const LD_NO_PRACTICE = bilingual('（未选）', '(none chosen)');
export const LD_FEEDBACK = bilingual('反馈', 'Shared feedback');
export const LD_FEEDBACK_NONE = bilingualLine('还没有人分享', 'Nothing shared yet');
export function answeredLine(answered: number, signedUp: number): string {
  return bilingualLine(`${answered}/${signedUp} 人已分享`, `${answered} of ${signedUp} shared`);
}
export function areaCountLine(area: string, count: number): string {
  return `${area}: ${count}`;
}

// ---- actions ----
export const LD_EXPORT = bilingual('导出 CSV', 'Export CSV');
export const LD_TEST = bilingual('发送测试提醒', 'Send test check-in');
export const LD_TEST_SENDING = bilingual('发送中…', 'Sending…');
export const LD_TEST_OK = bilingualLine(
  '测试提醒已模拟发送到你的邮箱（不会真的发出）', 'Test check-in simulated to your email (dry run, nothing was sent)'
);
export const LD_TEST_FAILED = bilingualLine('测试提醒失败', 'Test check-in failed');
export const LD_TEST_NO_EMAIL = bilingualLine('你的账号没有邮箱', 'Your account has no email address');
export const LD_BACK = bilingual('返回', 'Back');

// ---- leader home "#/leader" (ADR-0006) ----
export const LH_TITLE = bilingual('我的查经包', 'My study packs');
export const LH_SIGNIN = bilingualLine('带领者请登录，在任何设备上看到你所有的查经包', 'Leaders, sign in to see all your study packs on any device');
export const LH_LOADING = bilingualLine('读取查经包中', 'Loading your packs');
export const LH_PRESENT = bilingual('放映', 'Present');
export const LH_RESPONSES = bilingual('报名与反馈', 'Sign-ups & responses');
export const LH_QR = bilingual('报名二维码', 'Sign-up QR');
export const LH_ERR_COUNTS = bilingualLine('读取报名与分享人数失败', 'Could not load the sign-up and sharing counts');
export function packCountsLine(signups: number, answers: number): string {
  return bilingualLine(`报名 ${signups} 人，分享 ${answers} 条`, `${signups} signed up, ${answers} shared`);
}

// ---- stop / resume one member, pause the study (ADR-0009) ----
export const LD_STOP = bilingualLine('停止提醒', 'Stop emails');
export const LD_RESUME = bilingualLine('恢复', 'Resume');
export const LD_UNSUBSCRIBED = bilingualLine('已退订', 'Unsubscribed');
export const LD_BY_MEMBER = bilingualLine('成员本人已退订', 'The member unsubscribed themselves');
export const LD_BY_LEADER = bilingualLine('组长已停发', 'Stopped by the leader');
export const LD_ERR_SUBSCRIPTION = bilingualLine('更新提醒状态失败', 'Could not update reminders');
export const LD_PAUSE = bilingualLine('暂停本次查经的提醒', 'Pause this study\'s reminders');
export const LD_PAUSED = bilingualLine('提醒已暂停（新报名的确认邮件照常发出）', 'Reminders paused (new sign-ups still get their confirmation)');
export const LD_ERR_PAUSE = bilingualLine('更新暂停状态失败', 'Could not change the pause');
