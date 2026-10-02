/**
 * senders.ts — Resend (email) and Twilio (SMS) REST calls · 发送通道
 *
 * Plain fetch, no SDKs, no Deno globals (vitest can stub fetch). Each sender
 * resolves on success and throws with the provider's response text on any
 * non-OK status, so the caller records a failed checkin_sends row — nothing
 * is swallowed.
 */
import { CHECKIN_FROM_EMAIL, CheckinMessage } from './templates.ts';

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

/** Send one email through Resend. Throws on a non-OK response. */
export async function sendEmail(apiKey: string, to: string, message: CheckinMessage): Promise<void> {
  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: CHECKIN_FROM_EMAIL, to: [to], subject: message.subject, text: message.text }),
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
