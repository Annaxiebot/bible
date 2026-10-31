/**
 * signInStrings.ts — every user-visible string of the sign-in choices · 登录文案 (ADR-0020)
 *
 * Single source (R3): SignInChoices / EmailSignIn render these; the landing,
 * the TV pill and the tests import them. Chinese first, English second
 * (ADR-0003 §1). Pure module (no React) so Playwright specs can import it.
 * The Google button keeps its own label (signupStrings SU_SIGN_IN_GOOGLE).
 */
import { bilingual, bilingualLine } from '../studypack/principles';
import { EMAIL_CODE_LENGTH } from '../../supabase/auth/emailSignIn';

/** Disclosed before a click that needs sign-in (landing New study, the TV Ask AI pill): both ways in. */
export const SIGN_IN_OPTIONS_NOTE = bilingualLine('需登录（Google 或邮箱）', 'Sign in with Google or email');

/** The quieter second choice beside the Google button. */
export const SI_EMAIL_TOGGLE = bilingual('用邮箱登录', 'Sign in with email');
export const SI_EMAIL_LABEL = bilingual('邮箱', 'Email');
export const SI_EMAIL_PLACEHOLDER = 'name@example.com';
export const SI_SEND = bilingual('发送登录链接', 'Send sign-in link');
export const SI_SENDING = bilingual('发送中…', 'Sending…');

/** Shown after every successful send, whether or not the address has an account (no enumeration, ADR-0020). */
export const SI_SENT = bilingualLine('已发送，请查看邮箱', 'Sent — check your email');
export const SI_SENT_HOW = bilingualLine(
  `点邮件里的链接，或在下面输入邮件里的 ${EMAIL_CODE_LENGTH} 位登录码`,
  `click the link in the email, or enter its ${EMAIL_CODE_LENGTH}-digit code below`,
);
export const SI_CODE_LABEL = bilingual('登录码', 'Sign-in code');
export const SI_VERIFY = bilingual('登录', 'Sign in');
export const SI_VERIFYING = bilingual('登录中…', 'Signing in…');
export const SI_OTHER_EMAIL = bilingual('换一个邮箱', 'Use another email');
/** The code was accepted; the page follows the session (signed-in pages replace the choices). */
export const SI_SIGNED_IN = bilingualLine('已登录', 'Signed in');

export const SI_ERR_EMAIL = bilingualLine('请输入有效的邮箱', 'enter a valid email address');
export const SI_ERR_CODE = bilingualLine(`请输入 ${EMAIL_CODE_LENGTH} 位登录码`, `enter the ${EMAIL_CODE_LENGTH}-digit code`);
export const SI_ERR_CODE_WRONG = bilingualLine('登录码不对或已过期，请重新发送', 'the code is wrong or has expired — send a new one');
export const SI_ERR_RATE = bilingualLine('发送太频繁，请稍后再试，或用 Google 登录', 'too many emails — try again later, or sign in with Google');
/** Supabase's default mailer sends only to the project's team until custom SMTP is set (ADR-0020 "Email delivery"). */
export const SI_ERR_NOT_OPEN = bilingualLine('邮箱登录暂时无法发到这个邮箱，请用 Google 登录', 'email sign-in cannot reach this address yet — please sign in with Google');
/** Prefixes of the red line for any other failure; the server message follows. */
export const SI_ERR_SEND = bilingualLine('发送失败', 'could not send');
export const SI_ERR_VERIFY = bilingualLine('登录失败', 'sign-in failed');
