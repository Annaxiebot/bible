/**
 * feedbackEmail.ts — the one notification email per feedback row · 反馈通知邮件
 *
 * Pure (vitest-covered). Plain text + HTML in the check-in emails' paper
 * style (emailHtml's shell, header and rows — one copy, R3); every
 * user-typed value passes through escapeHtml. The owner replies with the
 * mail client's Reply: Reply-To is the sender's email when they left one
 * (senders.resendBody adds `reply_to`). Only facts the owner can act on are
 * shown — the database row id and an empty pack are left out.
 */
import { escapeHtml, header, renderEmailDocument, row, SMALL_LABEL } from '../send-checkins/emailHtml.ts';
import { EMAIL_COLORS as C, EMAIL_HEAD_FONT } from '../send-checkins/emailStyle.ts';
import type { EmailConfig } from '../send-checkins/senders.ts';
import { CHECKIN_TIMEZONE, packUrl, type CheckinMessage } from '../send-checkins/templates.ts';
import { FEEDBACK_LABEL, type FeedbackRecord, type FeedbackSource } from '../_shared/feedback.ts';

export const FEEDBACK_SUBJECT = '意见反馈 · Feedback — scripturetolife.org';

/** Where the writer followed the feedback link from, in words. */
export const FEEDBACK_SOURCE_LABEL: Record<FeedbackSource, string> = {
  landing: '首页 · Home page',
  email: '提醒邮件 · Check-in email',
  tv: '电视查经 · TV study',
  member: '组员页面 · Member page',
};

export const DETAIL_LABEL = {
  reply: '回复 · Reply to',
  from: '来自 · Sent from',
  study: '查经 · Study',
  received: '时间 · Received',
} as const;
export const NO_REPLY_EMAIL = '未留邮箱，无法回复 · No email left, cannot reply';
export const UNKNOWN_SOURCE = '不明 · Unknown';
export const OPEN_STUDY_LABEL = '打开查经 · Open the study';

export interface StoredFeedback extends FeedbackRecord {
  id: string;
  createdAt: string;
}

/** "2026-10-06 12:13 (Pacific)" — the owner's local time, not UTC. */
export function formatReceived(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHECKIN_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} (Pacific)`;
}

interface Detail { label: string; text: string; href?: string }

/** The facts under the message; the study line only when the link carried a pack. */
function details(r: StoredFeedback): Detail[] {
  const list: Detail[] = [
    r.email ? { label: DETAIL_LABEL.reply, text: r.email, href: `mailto:${r.email}` } : { label: DETAIL_LABEL.reply, text: NO_REPLY_EMAIL },
    { label: DETAIL_LABEL.from, text: r.context.from ? FEEDBACK_SOURCE_LABEL[r.context.from] : UNKNOWN_SOURCE },
  ];
  if (r.context.pack) list.push({ label: DETAIL_LABEL.study, text: OPEN_STUDY_LABEL, href: packUrl(r.context.pack) });
  list.push({ label: DETAIL_LABEL.received, text: formatReceived(r.createdAt) });
  return list;
}

function detailHtml(d: Detail): string {
  const value = d.href
    ? `<a href="${escapeHtml(d.href)}" style="color:${C['gold-deep']};text-decoration:underline;">${escapeHtml(d.text)}</a>`
    : escapeHtml(d.text);
  return `<p style="${SMALL_LABEL}">${escapeHtml(d.label)}</p><p style="margin:0 0 14px;">${value}</p>`;
}

export function feedbackEmail(r: StoredFeedback): CheckinMessage {
  const list = details(r);
  const text = [FEEDBACK_SUBJECT, '', r.message, '', ...list.map(d => `${d.label}: ${d.href && !d.href.startsWith('mailto:') ? d.href : d.text}`)].join('\n');
  const rows = header()
    + row(`<p style="margin:0;font-family:${EMAIL_HEAD_FONT};font-size:22px;font-weight:700;">${escapeHtml(FEEDBACK_LABEL)}</p>`, 'padding-top:22px;')
    + row(`<div style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:18px 20px;white-space:pre-wrap;">${escapeHtml(r.message)}</div>`)
    + row(list.map(detailHtml).join(''));
  return { subject: FEEDBACK_SUBJECT, text, html: renderEmailDocument(FEEDBACK_SUBJECT, r.message.split('\n')[0], rows) };
}

/** The check-in sender's settings with Reply-To = the person who wrote (or none). */
export function feedbackEmailConfig(base: EmailConfig, replyTo: string | null): EmailConfig {
  return { ...base, replyTo };
}
