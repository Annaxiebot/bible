/**
 * rememberedMember.ts — a returning member's details, on their own phone · 记住报名资料
 *
 * After a successful sign-up the member's name, email, phone and check-in
 * choice are kept in this browser's localStorage only (never sent anywhere,
 * never synced), so next week's QR scan opens with them filled in.
 * "不是你？· Not you?" forgets them (a shared or church phone).
 */
import { STORAGE_KEYS } from '../../constants/storageKeys';
import type { SignupForm } from './signupClient';

export type RememberedMember = Pick<SignupForm, 'name' | 'email' | 'phone' | 'consent'>;

export function readRememberedMember(): RememberedMember | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEYS.SIGNUP_MEMBER) ?? 'null') as Partial<RememberedMember> | null;
    if (!raw || typeof raw.name !== 'string' || typeof raw.email !== 'string' || !raw.name || !raw.email) return null;
    return { name: raw.name, email: raw.email, phone: typeof raw.phone === 'string' ? raw.phone : '', consent: raw.consent !== false };
  } catch {
    // R5 (c): unreadable or blocked storage just means "not remembered" — the empty form is the correct fallback.
    return null;
  }
}

export function rememberMember(form: RememberedMember): void {
  try {
    const { name, email, phone, consent } = form;
    localStorage.setItem(STORAGE_KEYS.SIGNUP_MEMBER, JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), consent }));
  } catch {
    // R5 (c): private mode or full storage — the sign-up itself is stored; remembering is a convenience only.
  }
}

export function forgetMember(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SIGNUP_MEMBER);
  } catch {
    // R5 (c): nothing stored or storage blocked — there is nothing to forget.
  }
}
