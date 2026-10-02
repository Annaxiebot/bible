/**
 * googleForms.ts — create a feedback form in the leader's own Google account · 自动建表单
 *
 * By default every pack gets its own Google Form (ADR-0004 §9): the Google
 * sign-in requests the forms.body scope, the session's provider_token is
 * used here only (in memory, never logged, never sent to our backend), and
 * two Forms API calls build the form: forms.create (title), then
 * forms.batchUpdate (five items). The responder link is stored on the pack.
 * Prefill ids: the Forms API returns hexadecimal questionIds, but the
 * entry.<id> used by prefilled links is not documented as derivable from
 * them, so auto-created forms are linked plain; a leader who wants prefill
 * copies the ids from "Get pre-filled link" into the editor's fields.
 * Failures are typed (FormFailure), never thrown: the caller falls back to
 * the built-in check-in page and names the cause.
 * Setup steps for the owner: docs/guides/google-forms-setup.md.
 */

export const GOOGLE_FORMS_SCOPE = 'https://www.googleapis.com/auth/forms.body';
/** The sign-in scopes: identity + Forms; offline + consent so provider_token (and its refresh token) come back. */
export const GOOGLE_SIGN_IN_SCOPES = `openid email profile ${GOOGLE_FORMS_SCOPE}`;
export const GOOGLE_SIGN_IN_QUERY = { access_type: 'offline', prompt: 'consent' } as const;

export const FORMS_API_BASE = 'https://forms.googleapis.com/v1/forms';

export interface FormSource {
  title: string;
  practices: string[];   // the pack's seven life-menu practices (choice options)
}

export type FormFailure =
  | { kind: 'no-token' }        // signed out, or the session carries no provider_token (old session: sign in again)
  | { kind: 'no-permission' }   // 401/403: scope not granted or the token expired — sign in again
  | { kind: 'api-disabled' }    // 403 accessNotConfigured: the Forms API is not enabled on the OAuth project
  | { kind: 'api'; message: string };

export type FormResult =
  | { ok: true; formId: string; responderUri: string }
  | { ok: false; failure: FormFailure };

export const FORM_TITLE_SUFFIX = '本周操练反馈 Weekly practice feedback';
export const OTHER_OPTION = '其他 Other';

export function formTitle(packTitle: string): string {
  return `${packTitle} · ${FORM_TITLE_SUFFIX}`;
}

/** The five items, in order: name, practice (choice + Other), what I did, what changed, OK to share. */
export function formItems(practices: string[]): unknown[] {
  const text = (title: string, paragraph: boolean) => ({
    title, questionItem: { question: { required: false, textQuestion: { paragraph } } },
  });
  const options = [...practices, OTHER_OPTION].map(value => ({ value }));
  return [
    { ...text('姓名 Name', false), questionItem: { question: { required: true, textQuestion: { paragraph: false } } } },
    { title: '我本周的操练 My practice', questionItem: { question: { required: true, choiceQuestion: { type: 'RADIO', options } } } },
    text('我做了什么 What I did', true),
    text('我里面有什么改变 What changed in me', true),
    { title: '可以在小组分享吗 OK to share with the group?', questionItem: { question: { required: false, choiceQuestion: {
      type: 'RADIO', options: [{ value: '可以 Yes' }, { value: '不要 No' }],
    } } } },
  ];
}

/** forms.batchUpdate body: one createItem per item, at increasing indexes. */
export function batchUpdateBody(practices: string[]): { requests: unknown[] } {
  return { requests: formItems(practices).map((item, index) => ({ createItem: { item, location: { index } } })) };
}

async function postJson(url: string, token: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json: unknown = await response.json().catch(() => null);
  return { status: response.status, json };
}

interface GoogleError { error?: { message?: string; status?: string; errors?: Array<{ reason?: string }> } }

/** 403 "accessNotConfigured" (API not enabled) is told apart from a missing scope / expired token. */
export function failureFor(status: number, json: unknown): FormFailure {
  const error = (json as GoogleError | null)?.error;
  const reasons = error?.errors?.map(e => e.reason ?? '') ?? [];
  if (status === 403 && (reasons.includes('accessNotConfigured') || /has not been used|is disabled/i.test(error?.message ?? ''))) {
    return { kind: 'api-disabled' };
  }
  if (status === 401 || status === 403) return { kind: 'no-permission' };
  return { kind: 'api', message: error?.message ?? `HTTP ${status}` };
}

/** Create the form, then its items. Returns the responder link, or a typed failure. */
export async function createFeedbackForm(source: FormSource, token: string | null): Promise<FormResult> {
  if (!token) return { ok: false, failure: { kind: 'no-token' } };
  const created = await postJson(FORMS_API_BASE, token, { info: { title: formTitle(source.title), documentTitle: formTitle(source.title) } });
  if (created.status !== 200) return { ok: false, failure: failureFor(created.status, created.json) };
  const form = created.json as { formId?: unknown; responderUri?: unknown } | null;
  if (typeof form?.formId !== 'string' || typeof form.responderUri !== 'string') {
    return { ok: false, failure: { kind: 'api', message: 'forms.create returned no formId/responderUri' } };
  }
  const updated = await postJson(`${FORMS_API_BASE}/${form.formId}:batchUpdate`, token, batchUpdateBody(source.practices));
  if (updated.status !== 200) return { ok: false, failure: failureFor(updated.status, updated.json) };
  return { ok: true, formId: form.formId, responderUri: form.responderUri };
}
