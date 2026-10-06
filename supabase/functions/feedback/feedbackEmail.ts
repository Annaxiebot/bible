/**
 * feedbackEmail.ts — the one notification email per feedback row · 反馈通知邮件
 *
 * Pure (vitest-covered). Plain text + a simple HTML part; every user-typed
 * value passes through the check-in email's escapeHtml (one copy, R3). The
 * owner replies with the mail client's Reply: Reply-To is the sender's
 * email when they left one (senders.resendBody adds `reply_to`).
 */
import { escapeHtml } from '../send-checkins/emailHtml.ts';
import type { EmailConfig } from '../send-checkins/senders.ts';
import type { CheckinMessage } from '../send-checkins/templates.ts';
import type { FeedbackRecord } from '../_shared/feedback.ts';

export const FEEDBACK_SUBJECT = '意见反馈 · Feedback — scripturetolife.org';
const NONE = '—';

export interface StoredFeedback extends FeedbackRecord {
  id: string;
  createdAt: string;
}

/** The facts under the message, one "label: value" line each. */
function detailLines(row: StoredFeedback): string[] {
  return [
    `Reply-To: ${row.email ?? NONE}`,
    `From: ${row.context.from ?? NONE}`,
    `Pack: ${row.context.pack ?? NONE}`,
    `Row: ${row.id}`,
    `Received: ${row.createdAt}`,
  ];
}

export function feedbackEmail(row: StoredFeedback): CheckinMessage {
  const details = detailLines(row);
  const text = [FEEDBACK_SUBJECT, '', row.message, '', ...details].join('\n');
  const html = '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:16px;font-family:-apple-system,\'PingFang SC\',Arial,sans-serif;font-size:16px;line-height:1.6;">'
    + `<p style="margin:0 0 12px;font-weight:700;">${escapeHtml(FEEDBACK_SUBJECT)}</p>`
    + `<div style="white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(row.message)}</div>`
    + `<p style="margin:0;font-size:13px;color:#4a5260;">${details.map(escapeHtml).join('<br>')}</p>`
    + '</body></html>';
  return { subject: FEEDBACK_SUBJECT, text, html };
}

/** The check-in sender's settings with Reply-To = the person who wrote (or none). */
export function feedbackEmailConfig(base: EmailConfig, replyTo: string | null): EmailConfig {
  return { ...base, replyTo };
}
