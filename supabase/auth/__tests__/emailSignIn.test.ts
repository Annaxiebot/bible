/**
 * emailSignIn.test.ts — the auth settings and the email that email sign-in needs · 邮箱登录配置测试 (ADR-0020)
 *
 * The one email (new and known addresses) carries the link AND the 6-digit
 * code, Chinese first then English, in the check-in emails' paper colours;
 * codes are 6 digits and live 15 minutes; the plan turns the email provider
 * on and adds the site's redirect without dropping any existing entry, and
 * never touches SMTP, Google or rate limits.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  EMAIL_CODE_LENGTH, OTP_EXPIRY_SECONDS, SITE_URL, SIGN_IN_EMAIL_SUBJECT, LINK_PLACEHOLDER, CODE_PLACEHOLDER,
  signInEmailHtml, planEmailSignInConfig, mergedRedirects,
} from '../emailSignIn.ts';
import { EMAIL_COLORS } from '../../functions/send-checkins/emailStyle.ts';

const html = signInEmailHtml();

describe('the sign-in email', () => {
  it('carries both the one-click link and the code (the code twice: Chinese and English parts)', () => {
    expect(html).toContain(`href="${LINK_PLACEHOLDER}"`);
    expect(html.split(CODE_PLACEHOLDER)).toHaveLength(3);
    expect(LINK_PLACEHOLDER).toBe('{{ .ConfirmationURL }}');
    expect(CODE_PLACEHOLDER).toBe('{{ .Token }}');
  });

  it('Chinese first, then English; single use and 15 minutes in both', () => {
    expect(html.indexOf('登录码')).toBeLessThan(html.indexOf('lang="en"'));
    expect(html).toContain('只能用一次，15 分钟内有效');
    expect(html).toContain('work once and expire in 15 minutes');
    expect(SIGN_IN_EMAIL_SUBJECT).toMatch(/^[一-鿿]/);
    expect(SIGN_IN_EMAIL_SUBJECT).toContain(' · Your sign-in link and code');
  });

  it('the paper look of the check-in emails (one palette, R3)', () => {
    expect(html).toContain(EMAIL_COLORS.paper);
    expect(html).toContain(EMAIL_COLORS.cta);
    expect(html).not.toMatch(/<script|<link /i);
  });
});

describe('the auth config plan', () => {
  it('6-digit codes, 15-minute single-use links, the email provider on, the same template for new and known addresses', () => {
    expect(EMAIL_CODE_LENGTH).toBe(6);
    expect(OTP_EXPIRY_SECONDS).toBe(900);
    const plan = planEmailSignInConfig({ uri_allow_list: 'https://scripturetolife.org/**,http://localhost:3000/**' });
    expect(plan).toMatchObject({
      site_url: SITE_URL, external_email_enabled: true, mailer_otp_exp: 900, mailer_otp_length: 6,
      mailer_subjects_magic_link: SIGN_IN_EMAIL_SUBJECT, mailer_subjects_confirmation: SIGN_IN_EMAIL_SUBJECT,
    });
    expect(plan.mailer_templates_magic_link_content).toBe(html);
    expect(plan.mailer_templates_confirmation_content).toBe(html);
  });

  it('never touches SMTP, the Google provider or the rate limits (the default mailer stays)', () => {
    const keys = Object.keys(planEmailSignInConfig({}));
    expect(keys.filter(k => /smtp|google|rate_limit|password/.test(k))).toEqual([]);
  });

  it('redirects are additive: existing entries stay, the site\'s pattern is added once', () => {
    expect(mergedRedirects('https://scripturetolife.org/**,http://localhost:3000/**')).toBe('https://scripturetolife.org/**,http://localhost:3000/**');
    expect(mergedRedirects('http://localhost:3000/**')).toBe('http://localhost:3000/**,https://scripturetolife.org/**');
    expect(mergedRedirects(null)).toBe('https://scripturetolife.org/**');
    expect(mergedRedirects(' a , ,b ')).toBe('a,b,https://scripturetolife.org/**');
  });
});

describe('the privacy page (ADR-0020: in the same release)', () => {
  const privacy = readFileSync(path.resolve(__dirname, '..', '..', '..', 'public', 'privacy.html'), 'utf-8');

  it('says what email sign-in sends and keeps — a link and a code, no passwords, one account per address — dated this release', () => {
    expect(privacy).toContain('用邮箱登录：本站给你的邮箱发一封含登录链接和 6 位登录码的邮件');
    expect(privacy).toContain('this site has no passwords and stores none');
    expect(privacy).toContain('The same address via Google or email is the same account.');
    expect(privacy).toContain('Leaders who sign in with Google or with email');
    expect(privacy.indexOf('用邮箱登录：')).toBeLessThan(privacy.indexOf('Signing in with email:'));
    expect(privacy).toContain('更新 Updated 2026-10-23');
  });
});
