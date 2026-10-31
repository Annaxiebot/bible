/**
 * emailSignIn.ts — the Supabase Auth settings email sign-in needs · 邮箱登录配置 (ADR-0020)
 *
 * Pure (no fetch, no Deno, no browser API): the browser imports the code
 * length, scripts/supabase/email-signin-config.ts turns the plan into one
 * PATCH of the project's auth config, and tests pin both. Passwordless:
 * Supabase signInWithOtp sends ONE email carrying a one-click link AND a
 * 6-digit code (for signing in on another device than the one reading
 * email); both are single use and expire after OTP_EXPIRY_SECONDS. A new
 * address gets the "confirmation" email, a known one the "magic link"
 * email — the same Chinese-first text for both. Colours and fonts are the
 * check-in emails' paper look (send-checkins/emailStyle, R3).
 */
import {
  EMAIL_COLORS, EMAIL_BODY_FONT, EMAIL_HEAD_FONT, EMAIL_BODY_PX, EMAIL_MAX_WIDTH_PX, EMAIL_BRAND_EN, EMAIL_BRAND_ZH,
} from '../functions/send-checkins/emailStyle.ts';

/** Digits in the emailed code (Supabase mailer_otp_length); the browser's code box takes exactly this many. */
export const EMAIL_CODE_LENGTH = 6;
/** Link and code lifetime (Supabase mailer_otp_exp): 15 minutes, ADR-0020. */
export const OTP_EXPIRY_SECONDS = 15 * 60;
const OTP_EXPIRY_MINUTES = OTP_EXPIRY_SECONDS / 60;

/** The site; Supabase's site_url and the one redirect pattern the sign-ins need (the link lands on origin + path). */
export const SITE_URL = 'https://scripturetolife.org';
export const REQUIRED_REDIRECTS: readonly string[] = [`${SITE_URL}/**`];

export const SIGN_IN_EMAIL_SUBJECT = '你的登录链接和登录码 · Your sign-in link and code';

/** Supabase's Go-template placeholders (kept literal in the template). */
export const LINK_PLACEHOLDER = '{{ .ConfirmationURL }}';
export const CODE_PLACEHOLDER = '{{ .Token }}';

const C = EMAIL_COLORS;
const p = (style: string, html: string) => `<p style="margin:0 0 16px;${style}">${html}</p>`;

/** The email body: Chinese first, then English; the link as a gold pill, the code large and spaced. */
export function signInEmailHtml(): string {
  const button = `<a href="${LINK_PLACEHOLDER}" style="display:inline-block;padding:12px 28px;border-radius:999px;`
    + `background:${C.cta};color:${C.ink};font-weight:bold;text-decoration:none;">登录 · Sign in</a>`;
  const code = `<span style="font-size:32px;letter-spacing:8px;font-weight:bold;color:${C.ink};">${CODE_PLACEHOLDER}</span>`;
  return [
    `<div style="background:${C.paper};padding:24px 16px;">`,
    `<div style="max-width:${EMAIL_MAX_WIDTH_PX}px;margin:0 auto;font-family:${EMAIL_BODY_FONT};font-size:${EMAIL_BODY_PX}px;line-height:1.6;color:${C.ink};">`,
    p(`font-family:${EMAIL_HEAD_FONT};font-size:22px;color:${C['gold-deep']};`, `${EMAIL_BRAND_ZH} · ${EMAIL_BRAND_EN}`),
    p('', '点下面的按钮登录本站：'),
    p('', button),
    p('', '或在登录页输入这个 6 位登录码：'),
    p('', code),
    p(`color:${C['ink-2']};`, `链接和登录码只能用一次，${OTP_EXPIRY_MINUTES} 分钟内有效。如果不是你本人操作，请忽略这封邮件。`),
    `<hr style="border:none;border-top:1px solid ${C.line};margin:24px 0;">`,
    p(`color:${C['ink-2']};`, `<span lang="en">Click the button above to sign in, or enter this 6-digit code on the sign-in page: `
      + `<b>${CODE_PLACEHOLDER}</b>. The link and the code work once and expire in ${OTP_EXPIRY_MINUTES} minutes. `
      + `If you did not ask to sign in, ignore this email.</span>`),
    '</div>',
    '</div>',
  ].join('\n');
}

/** The fields of the project's auth config this release reads or sets (Management API names). */
export interface AuthConfigFields {
  site_url?: string | null;
  uri_allow_list?: string | null;
  external_email_enabled?: boolean | null;
  mailer_otp_exp?: number | null;
  mailer_otp_length?: number | null;
  smtp_host?: string | null;
  rate_limit_email_sent?: number | null;
}

/** The redirect allow list after adding the required entries — additive: nothing already there is dropped. */
export function mergedRedirects(current: string | null | undefined): string {
  const list = (current ?? '').split(',').map(s => s.trim()).filter(Boolean);
  for (const url of REQUIRED_REDIRECTS) if (!list.includes(url)) list.push(url);
  return list.join(',');
}

/**
 * The one PATCH that turns email sign-in on, from the current config. The
 * Google provider, SMTP and rate limits are not touched (the default Supabase
 * mailer stays — ADR-0020 "Email delivery" lists the custom-SMTP step).
 */
export function planEmailSignInConfig(current: AuthConfigFields): Record<string, string | number | boolean> {
  const html = signInEmailHtml();
  return {
    site_url: SITE_URL,
    uri_allow_list: mergedRedirects(current.uri_allow_list),
    external_email_enabled: true,
    mailer_otp_exp: OTP_EXPIRY_SECONDS,
    mailer_otp_length: EMAIL_CODE_LENGTH,
    mailer_subjects_magic_link: SIGN_IN_EMAIL_SUBJECT,
    mailer_templates_magic_link_content: html,
    mailer_subjects_confirmation: SIGN_IN_EMAIL_SUBJECT,
    mailer_templates_confirmation_content: html,
  };
}
