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
