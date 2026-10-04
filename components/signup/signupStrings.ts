/**
 * signupStrings.ts — every user-visible string of the sign-up page · 报名文案
 *
 * Single source (R3): the page renders these, unit + e2e tests import them.
 * Chinese first, English second (ADR-0003 §1). Pure module (no React) so
 * Playwright specs and the pack assembler can import it.
 */
import { bilingual, bilingualLine } from '../studypack/principles';

export const SU_TITLE = bilingual('报名', 'Sign up');
export const SU_INTRO = bilingualLine(
  '留下联系方式，周二、周四收到这周操练的提醒',
  'Leave a way to reach you and get this week’s practice check-ins on Tuesday and Thursday'
);

// ---- form ----
export const SU_NAME = bilingual('姓名', 'Name');
export const SU_PHONE = bilingual('手机（可选）', 'Phone (optional)');
export const SU_PHONE_HINT = bilingualLine('短信提醒开通后才会发送', 'Texts start once SMS is enabled');
export const SU_EMAIL = bilingual('邮箱（推荐）', 'Email (recommended)');
export const SU_CONSENT = bilingualLine('周二/周四收到提醒', 'Receive Tue/Thu check-ins');
export const SU_SUBMIT = bilingual('提交', 'Submit');
export const SU_SUBMITTING = bilingual('提交中…', 'Submitting…');

// ---- validation / errors (surfaced inline, never swallowed) ----
export const SU_ERR_NAME = bilingualLine('请填写姓名', 'Please enter your name');
export const SU_ERR_CONTACT = bilingualLine('请填写邮箱或手机', 'Please enter an email or a phone number');
export const SU_ERR_EMAIL = bilingualLine('邮箱格式不对', 'That email does not look right');
export const SU_ERR_PHONE = bilingualLine('手机号格式不对', 'That phone number does not look right');
export const SU_ERR_NOT_CONFIGURED = bilingualLine('报名服务未配置', 'The sign-up service is not configured');
export const SU_ERR_SUBMIT = bilingualLine('提交失败', 'Submission failed');
export const SU_ERR_PACK = bilingualLine('找不到这个查经包', 'This study pack could not be found');
/** Detail after SU_ERR_PACK when neither this phone nor the public projection has the pack (a member cannot fix it by signing in). */
export const SU_PACK_ASK_LEADER = bilingualLine('请向带领者要新的二维码', 'Ask your leader for a new QR code');
/** Detail after SU_ERR_PACK when the projection answered with something that is not a sign-up pack. */
export const SU_PACK_INVALID = bilingualLine('查经包数据不完整', 'The study pack data is incomplete');
export const SU_PACK_LOADING = bilingualLine('载入中', 'loading');

// ---- after submit ----
export const SU_THANKS = bilingual('谢谢，已登记！', 'Thank you, you are signed up!');
export const SU_NEXT = bilingualLine(
  '周二和周四早上九点会收到提醒；反思只留在你自己的设备上',
  'You will hear from us Tuesday and Thursday at 9 am; reflections stay on your own device'
);
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
export const SU_PREV_STEP = bilingual('上一步', 'Back');
export const SU_CONTACT_TITLE = bilingual('联系方式', 'How to reach you');
export const SU_ERR_PRACTICE = bilingualLine('请至少选一项操练', 'Please choose at least one practice');
/** Thank-you restatement: "你本周的操练：<text> · Your practice this week: <text>". */
export function commitmentLine(practice: string): string {
  return bilingualLine(`你本周的操练：${practice}`, `Your practice this week: ${practice}`);
}

// ---- QR panel (TV slide + landing), shared by every pack ----
export const SU_QR_BODY = bilingualLine('扫码报名，周二周四收到提醒', 'Scan to sign up for the Tue/Thu check-ins');
export const SU_QR_FAILED = bilingualLine('二维码生成失败', 'The QR code could not be drawn');
/** pack_summaries upsert failed: check-ins for this pack would have no text until it succeeds. */
export const SU_SUMMARY_FAILED = bilingualLine('提醒内容未同步', 'Check-in text not synced');

/** Accessible name of a rendered QR (tests and e2e look it up by this). */
export function qrAltText(url: string): string {
  return `QR code for ${url}`;
}
