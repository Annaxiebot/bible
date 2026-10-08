/**
 * signupStrings.ts — every user-visible string of the sign-up page · 报名文案
 *
 * Single source (R3): the page renders these, unit + e2e tests import them.
 * Chinese first, English second (ADR-0003 §1). Pure module (no React) so
 * Playwright specs and the pack assembler can import it.
 */
import { bilingual, bilingualLine } from '../studypack/principles';
import { SIGNUP_PROBLEM_TEXT } from '../../supabase/functions/_shared/signup';

export const SU_TITLE = bilingual('报名', 'Sign up');
export const SU_INTRO = bilingualLine(
  '留下联系方式，周二、周四收到这周操练的提醒',
  'Leave a way to reach you and get this week’s practice check-ins on Tuesday and Thursday'
);

// ---- form ----
export const SU_NAME = bilingual('姓名', 'Name');
export const SU_PHONE = bilingual('手机（可选）', 'Phone (optional)');
export const SU_PHONE_HINT = bilingualLine('短信提醒开通后才会发送', 'Texts start once SMS is enabled');
/** Required: email is the check-in channel (ADR-0004); phone stays optional. */
export const SU_EMAIL = bilingual('邮箱', 'Email');
export const SU_CONSENT = bilingualLine('周二/周四收到提醒', 'Receive Tue/Thu check-ins');
export const SU_SUBMIT = bilingual('提交', 'Submit');
export const SU_SUBMITTING = bilingual('提交中…', 'Submitting…');

// ---- validation / errors (surfaced inline, never swallowed) ----
// The validation lines are the function's own (supabase/functions/_shared/signup.ts, R3): page and server say the same.
export const SU_ERR_NAME = SIGNUP_PROBLEM_TEXT['name-empty'];
export const SU_ERR_EMAIL_REQUIRED = SIGNUP_PROBLEM_TEXT['email-empty'];
export const SU_ERR_EMAIL = SIGNUP_PROBLEM_TEXT['email-shape'];
export const SU_ERR_PHONE = SIGNUP_PROBLEM_TEXT['phone-shape'];
export const SU_ERR_NOT_CONFIGURED = bilingualLine('报名服务未配置', 'The sign-up service is not configured');
export const SU_ERR_SUBMIT = bilingualLine('提交失败', 'Submission failed');
export const SU_ERR_PACK = SIGNUP_PROBLEM_TEXT['pack-unknown'];
/** Detail after SU_ERR_PACK when neither this phone nor the public projection has the pack (a member cannot fix it by signing in). */
export const SU_PACK_ASK_LEADER = bilingualLine('请向带领者要新的二维码', 'Ask your leader for a new QR code');
/** Detail after SU_ERR_PACK when the projection answered with something that is not a sign-up pack. */
export const SU_PACK_INVALID = bilingualLine('查经包数据不完整', 'The study pack data is incomplete');
export const SU_PACK_LOADING = bilingualLine('载入中', 'loading');

// ---- after submit ----
export const SU_THANKS = bilingual('谢谢，已登记！', 'Thank you, you are signed up!');
export const SU_NEXT = bilingualLine(
  '周二、周四和周末早上九点会收到提醒；你可以把反思留给自己，或分享给组长',
  'You will hear from us Tuesday, Thursday and the weekend at 9 am; keep your reflections private or share them with your leader'
);
/** The thank-you when this sign-up replaced the member's earlier one for the same pack + email. */
export const SU_REPLACED = bilingualLine('已更新你之前的报名', 'Your earlier sign-up was updated');
/** mark_replaced_signups failed: the new row is stored, but an earlier one may still get check-ins; the reason follows. */
export const SU_REPLACE_FAILED = bilingualLine('未能更新之前的报名', 'Could not update your earlier sign-up');
export const SU_NEXT_NO_CHECKINS = bilingualLine('你选择了不接收提醒', 'You chose not to receive check-ins');
export const SU_PRIVACY = bilingualLine(
  '这些信息只用于你勾选的提醒',
  'This information is used only for the check-ins you opted into'
);

/** Public packs without an owning leader (no leaderId) have no sign-up: shown on the TV qr slide, the landing panel and #/signup. */
export const SU_DEMO_LINE = bilingualLine('示范包，无报名', 'Demo pack, no sign-up');
/** A local pack generated while signed out: signing in on this browser claims it (packSource.packSignupState). */
export const SU_UNCLAIMED_LINE = bilingualLine('登录以启用报名', 'Sign in to enable sign-up');
export const SU_SIGN_IN_GOOGLE = bilingual('用 Google 登录', 'Sign in with Google');
export const SU_SIGNING_IN = bilingual('正在跳转…', 'Redirecting…');
/** Claiming a local pack after sign-in failed (storage or summary sync); the ids and reason follow. */
export const SU_CLAIM_FAILED = bilingualLine('登录后未能认领查经包', 'Could not claim the pack after sign-in');

// ---- commitment (the sign-up's first step, ADR-0004 §7) ----
export const SU_PRACTICE_TITLE = bilingual('我本周的操练', 'My practice this week');
export const SU_PRACTICE_INTRO = bilingualLine('从生活应用里选一项或多项（再点一下取消）', 'Pick one or more from the life menu (tap again to clear)');
export const SU_PRACTICE_NOTE = bilingual('我的版本（可选）', 'My own version (optional)');
export const SU_NEXT_STEP = bilingual('下一步', 'Next');
/** A returning member: their details are remembered on this phone, so step 1 can submit at once. */
export const suWelcomeBack = (name: string) => bilingualLine(`欢迎回来，${name}`, `Welcome back, ${name}`);
export const SU_DETAILS_FILLED = bilingualLine('你的资料已填好，选好本周的操练就可以提交', 'Your details are filled in — choose this week\'s practice and submit');
export const SU_EDIT_DETAILS = bilingual('修改资料', 'Edit my details');
export const SU_NOT_YOU = bilingual('不是你？', 'Not you?');
export const SU_PREV_STEP = bilingual('上一步', 'Back');
export const SU_CONTACT_TITLE = bilingual('联系方式', 'How to reach you');
export const SU_ERR_PRACTICE = SIGNUP_PROBLEM_TEXT['practice-none'];
/**
 * Thank-you restatement: "你本周的操练 · Your practice this week：<text>". The
 * practice text is already bilingual, so it appears once (it used to be
 * repeated inside both halves).
 */
export function commitmentLine(practice: string): string {
  return `${bilingualLine('你本周的操练', 'Your practice this week')}：${practice}`;
}

// ---- QR panel (TV slide + landing), shared by every pack ----
export const SU_QR_BODY = bilingualLine('扫码报名，周二周四收到提醒', 'Scan to sign up for the Tue/Thu check-ins');
/** The leader's #/qr page: print the code, and go back to the leader home. */
export const SU_QR_PRINT = bilingualLine('打印', 'Print');
export const SU_QR_BACK = bilingualLine('返回我的查经包', 'Back to my study packs');
export const SU_QR_FAILED = bilingualLine('二维码生成失败', 'The QR code could not be drawn');
/** pack_summaries upsert failed: check-ins for this pack would have no text until it succeeds. */
export const SU_SUMMARY_FAILED = bilingualLine('提醒内容未同步', 'Check-in text not synced');

/** Accessible name of a rendered QR (tests and e2e look it up by this). */
export function qrAltText(url: string): string {
  return `QR code for ${url}`;
}
