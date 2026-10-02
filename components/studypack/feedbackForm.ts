/**
 * feedbackForm.ts — the leader's optional Google Form for feedback · 反馈表
 *
 * Pure module (no React, no globals): the pack schema validates with it, the
 * New-study form and the editor accept URLs with it, and the check-in link
 * chooser (`feedbackLink`) decides between the in-app #/checkin page and the
 * form. Google Forms prefill format (ADR-0004 §9):
 *   <form>/viewform?usp=pp_url&entry.<id>=<value>
 * The edge function (Deno) carries a copy of `prefillFormUrl`; a test pins
 * both copies to the same output.
 */

const GOOGLE_FORM_URL_RE = /^https:\/\/docs\.google\.com\/forms\/[^\s]+$/;
const FORM_ENTRY_ID_RE = /^entry\.\d+$/;

export function isGoogleFormUrl(url: string): boolean {
  return GOOGLE_FORM_URL_RE.test(url.trim());
}

export function isFormEntryId(id: string): boolean {
  return FORM_ENTRY_ID_RE.test(id);
}

export interface FormEntryIds {
  name?: string;
  practice?: string;
}

export interface FormPrefill {
  name: string;
  practice: string;
}

/**
 * The form URL with prefilled answers for whichever entry ids the leader
 * supplied; the plain URL when there are none. Values (including Chinese
 * practice text) are percent-encoded by URLSearchParams.
 */
export function prefillFormUrl(formUrl: string, entries: FormEntryIds | undefined, values: FormPrefill): string {
  const params = new URLSearchParams();
  if (entries?.name) params.set(entries.name, values.name);
  if (entries?.practice) params.set(entries.practice, values.practice);
  if ([...params.keys()].length === 0) return formUrl;
  params.set('usp', 'pp_url');
  const joiner = formUrl.includes('?') ? '&' : '?';
  return `${formUrl}${joiner}${params.toString()}`;
}
