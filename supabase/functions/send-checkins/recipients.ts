/**
 * recipients.ts — who gets which channel · 收件人筛选
 *
 * Pure (vitest-covered). One message per consenting sign-up: email when the
 * row has an email; otherwise SMS, but only once CHECKIN_SMS_ENABLED is on
 * (Twilio toll-free verification pending). Rows with neither, or without
 * consent, are skipped — the skip reasons are returned so the caller logs
 * them instead of dropping them silently.
 */
import type { MemberContext } from './templates.ts';

export type Channel = 'email' | 'sms';

export interface SignupRow {
  id: string | null;             // null for the leader's ad-hoc test recipient
  pack_id: string;
  leader_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_checkins: boolean;
  practice_text: string | null;  // the committed life-menu practice (ADR-0004 §7)
  practice_note: string | null;  // the member's own version, when written
  created_at?: string;           // ISO; the welcome window is checked against it
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

/** The member context a template renders for: own version beats the menu text. */
export function memberContext(signup: SignupRow): MemberContext {
  const practice = signup.practice_note?.trim() || signup.practice_text || null;
  return { name: signup.name, signupId: signup.id, practice };
}

/** The leader's "send me a test" recipient: a synthetic consenting row with only an email. */
export function testRecipientRow(packId: string, leaderId: string, email: string, name: string): SignupRow {
  return {
    id: null, pack_id: packId, leader_id: leaderId, name, phone: null, email, consent_checkins: true,
    practice_text: null, practice_note: null,
  };
}

/** How long after sign-up the member's browser may still ask for the welcome message (anon, by signup id). */
export const WELCOME_WINDOW_MS = 10 * 60 * 1000;

/** A welcome may be requested only for a row created within the window; otherwise the reason. */
export function welcomeAllowed(row: SignupRow, now: Date): { ok: true } | { ok: false; reason: string } {
  if (!row.created_at) return { ok: false, reason: 'signup has no created_at' };
  const age = now.getTime() - new Date(row.created_at).getTime();
  if (Number.isNaN(age) || age < 0 || age > WELCOME_WINDOW_MS) return { ok: false, reason: 'signup is outside the welcome window' };
  return { ok: true };
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
