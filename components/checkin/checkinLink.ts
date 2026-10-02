/**
 * checkinLink.ts — which link a member gets for feedback · 跟进链接选择
 *
 * Default: the in-app check-in page (#/checkin/<signupId>[/<kind>]). When
 * the pack carries a Google Form (feedbackFormUrl), every check-in link
 * points at the form instead, prefilled with name + practice when the
 * leader supplied the entry ids (ADR-0004 §9). Pure; the edge function
 * mirrors this in templates.ts (pinned by a test).
 */
import type { StudyPack } from '../studypack/packTypes';
import { prefillFormUrl } from '../studypack/feedbackForm';
import { checkinUrl, CheckinKind } from './checkinRoute';

export interface CheckinLinkInput {
  pack: Pick<StudyPack, 'feedbackFormUrl' | 'feedbackFormEntries'>;
  signupId: string;
  kind?: CheckinKind;
  name: string;
  practice: string;
}

export function checkinLink(input: CheckinLinkInput, origin: string, base: string): string {
  const { pack } = input;
  if (pack.feedbackFormUrl) {
    return prefillFormUrl(pack.feedbackFormUrl, pack.feedbackFormEntries, { name: input.name, practice: input.practice });
  }
  return checkinUrl(input.signupId, input.kind, origin, base);
}

/** The link for this deployment (origin + BASE_URL), the way the QR URL is built. */
export function currentCheckinLink(input: CheckinLinkInput): string {
  return checkinLink(input, window.location.origin, import.meta.env.BASE_URL);
}
