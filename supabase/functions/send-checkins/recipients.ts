/**
 * recipients.ts — who gets which channel · 收件人筛选
 *
 * Pure (vitest-covered). One message per consenting sign-up: email when the
 * row has an email; otherwise SMS, but only once CHECKIN_SMS_ENABLED is on
 * (Twilio toll-free verification pending). Rows with neither, or without
 * consent, are skipped — the skip reasons are returned so the caller logs
 * them instead of dropping them silently.
 */

export type Channel = 'email' | 'sms';

export interface SignupRow {
  id: string | null;             // null for the leader's ad-hoc test recipient
  pack_id: string;
  leader_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_checkins: boolean;
}

export interface Recipient {
  signup: SignupRow;
  channel: Channel;
  to: string;
}

export type SkipReason = 'no-consent' | 'no-contact' | 'sms-disabled';

export interface Selection {
  recipients: Recipient[];
  skipped: Array<{ signup: SignupRow; reason: SkipReason }>;
}

export function selectRecipients(rows: SignupRow[], options: { smsEnabled: boolean }): Selection {
  const selection: Selection = { recipients: [], skipped: [] };
  for (const signup of rows) {
    if (!signup.consent_checkins) {
      selection.skipped.push({ signup, reason: 'no-consent' });
    } else if (signup.email) {
      selection.recipients.push({ signup, channel: 'email', to: signup.email });
    } else if (signup.phone && options.smsEnabled) {
      selection.recipients.push({ signup, channel: 'sms', to: signup.phone });
    } else if (signup.phone) {
      selection.skipped.push({ signup, reason: 'sms-disabled' });
    } else {
      selection.skipped.push({ signup, reason: 'no-contact' });
    }
  }
  return selection;
}

/** The leader's "send me a test" recipient: a synthetic consenting row with only an email. */
export function testRecipientRow(packId: string, leaderId: string, email: string, name: string): SignupRow {
  return { id: null, pack_id: packId, leader_id: leaderId, name, phone: null, email, consent_checkins: true };
}

/**
 * The one leader a send is for: the pack's leaderId, which every row must
 * carry. Throws for a demo pack (no leader) or when any row's leader_id
 * disagrees with the pack — a client-supplied pack can never redirect
 * another leader's list.
 */
export function verifyLeader(pack: { id: string; leaderId: string | null }, rows: SignupRow[]): string {
  if (!pack.leaderId) throw new Error(`Pack ${pack.id} has no leader (demo pack): nothing to send`);
  const foreign = rows.filter(r => r.leader_id !== pack.leaderId || r.pack_id !== pack.id);
  if (foreign.length > 0) {
    throw new Error(`Pack ${pack.id}: ${foreign.length} sign-up row(s) belong to another leader or pack`);
  }
  return pack.leaderId;
}
