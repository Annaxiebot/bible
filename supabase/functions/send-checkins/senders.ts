/**
 * senders.ts — Resend (email) and Twilio (SMS) REST calls · 发送通道
 *
 * Plain fetch, no SDKs, no Deno globals (vitest can stub fetch). Each sender
 * resolves on success and throws with the provider's response text on any
 * non-OK status, so the caller records a failed checkin_sends row — nothing
 * is swallowed.
 */
import { CHECKIN_FROM_EMAIL, CheckinMessage } from './templates.ts';
import { listUnsubscribeHeaders } from './optout.ts';

export const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

export function twilioMessagesUrl(accountSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

async function failureText(response: Response): Promise<string> {
  const body = await response.text();
  return `HTTP ${response.status}: ${body.slice(0, 500)}`;
}

export interface EmailConfig {
  apiKey: string;
  /** Resend `from`; CHECKIN_FROM_EMAIL unless CHECKIN_FROM overrides it. */
  from: string;
  /** Resend `reply_to`; omitted from the request when null (CHECKIN_REPLY_TO unset). */
  replyTo: string | null;
}

/**
 * Email settings from the environment (index.ts passes Deno.env; tests pass a
 * map). Blank or missing values fall back: FROM → the constant, REPLY_TO → none.
 */
export function emailConfig(env: (name: string) => string): EmailConfig {
  const from = env('CHECKIN_FROM').trim();
  const replyTo = env('CHECKIN_REPLY_TO').trim();
  return { apiKey: env('RESEND_API_KEY'), from: from || CHECKIN_FROM_EMAIL, replyTo: replyTo || null };
}

/**
 * The Resend request body: `text` always, `html` when the message has one
 * (Resend sends both as multipart/alternative); `reply_to` only when configured, and
 * the List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058) only when
 * the message carries a member's one-click URL.
 */
export function resendBody(config: EmailConfig, to: string, message: CheckinMessage): Record<string, unknown> {
  const body: Record<string, unknown> = { from: config.from, to: [to], subject: message.subject, text: message.text };
  if (message.html) body.html = message.html;
  if (config.replyTo) body.reply_to = config.replyTo;
  if (message.oneClickUrl) body.headers = listUnsubscribeHeaders(message.oneClickUrl);
  return body;
}

/** Send one email through Resend. Throws on a non-OK response. */
export async function sendEmail(config: EmailConfig, to: string, message: CheckinMessage): Promise<void> {
  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resendBody(config, to, message)),
  });
  if (!response.ok) throw new Error(`Resend ${await failureText(response)}`);
}

/** Send one SMS through Twilio (form-encoded, basic auth). Throws on a non-OK response. */
export async function sendSms(config: TwilioConfig, to: string, message: CheckinMessage): Promise<void> {
  const form = new URLSearchParams({ From: config.from, To: to, Body: message.text });
  const credentials = btoa(`${config.accountSid}:${config.authToken}`);
  const response = await fetch(twilioMessagesUrl(config.accountSid), {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!response.ok) throw new Error(`Twilio ${await failureText(response)}`);
}
