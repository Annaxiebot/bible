/**
 * FeedbackPage.test.tsx — the public feedback page · 意见反馈页测试 (ADR-0011)
 *
 * The anon client's functions.invoke is faked with the edge function's
 * contract (feedbackHandler): the shared validation first (400 + problem
 * code), the rate limit (429), else 200 + row id. Failures surface as typed
 * lines; the context from the link goes with the message, shown nowhere.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import FeedbackPage, { FEEDBACK_PAGE_TEST_ID } from '../FeedbackPage';
import { PAPER_FEEDBACK_TEST_ID, PAPER_HOME_TEST_ID } from '../../shared/PaperHeader';
import {
  FEEDBACK_FUNCTION, FEEDBACK_LABEL, FEEDBACK_MAX_CHARS, HONEYPOT_FIELD, validateFeedback,
} from '../../../supabase/functions/_shared/feedback';
import { FB_ERRORS, FB_THANKS, FB_EMAIL_LABEL, FB_MESSAGE_LABEL } from '../feedbackStrings';
import { SETUP_MIN_FONT_PX } from '../../setup/setupStrings';

const httpError = (status: number, body: unknown) =>
  new FunctionsHttpError(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

let mode: 'ok' | 'rate' | 'down' | 'offline' = 'ok';
const calls: Array<{ fn: string; body: Record<string, unknown> }> = [];

/** The function's contract: validate (400 + code), rate limit (429), else the stored row's id. */
async function fakeInvoke(fn: string, options: { body: Record<string, unknown> }) {
  calls.push({ fn, body: options.body });
  if (mode === 'offline') return { data: null, error: new FunctionsFetchError('Failed to fetch') };
  const verdict = validateFeedback(options.body);
  if (verdict.ok === false) return { data: null, error: httpError(400, { error: verdict.problem }) };
  if (mode === 'rate') return { data: null, error: httpError(429, { error: 'rate-limited' }) };
  if (mode === 'down') return { data: null, error: httpError(500, { error: 'feedback insert failed' }) };
  return { data: { id: 'row-1', emailed: true }, error: null };
}
vi.mock('../../../services/supabase', () => ({
  supabase: { functions: { invoke: (fn: string, options: { body: Record<string, unknown> }) => fakeInvoke(fn, options) } },
}));

const type = (testId: string, value: string) => fireEvent.change(screen.getByTestId(testId), { target: { value } });
const send = () => fireEvent.click(screen.getByTestId('feedback-send'));

describe('FeedbackPage', () => {
  beforeEach(() => { mode = 'ok'; calls.length = 0; });

  it('heading, a ≥ 20px textarea capped at 2000, the optional email, a hidden honeypot; brand link without a self-link', () => {
    render(<FeedbackPage context={{}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(FEEDBACK_LABEL);
    const message = screen.getByLabelText(FB_MESSAGE_LABEL);
    expect(parseFloat((message as HTMLElement).style.fontSize)).toBeGreaterThanOrEqual(SETUP_MIN_FONT_PX);
    expect(message).toHaveAttribute('maxLength', String(FEEDBACK_MAX_CHARS));
    expect(screen.getByLabelText(FB_EMAIL_LABEL)).toHaveAttribute('type', 'email');
    const trap = screen.getByTestId('feedback-honeypot');
    expect(trap).toHaveAttribute('name', HONEYPOT_FIELD);
    expect(trap).toHaveAttribute('tabIndex', '-1');
    expect(trap.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId(PAPER_HOME_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(PAPER_FEEDBACK_TEST_ID)).toBeNull();
  });

  it('sends message + email + context (shown nowhere) → the thank-you line', async () => {
    render(<FeedbackPage context={{ from: 'email', pack: 'p1' }} />);
    expect(screen.getByTestId(FEEDBACK_PAGE_TEST_ID).textContent).not.toContain('p1');
    type('feedback-message', '很喜欢 Love it');
    type('feedback-email', 'm@x.org');
    send();
    expect(await screen.findByTestId('feedback-thanks')).toHaveTextContent(FB_THANKS);
    expect(calls).toEqual([{ fn: FEEDBACK_FUNCTION, body: { message: '很喜欢 Love it', email: 'm@x.org', [HONEYPOT_FIELD]: '', context: { from: 'email', pack: 'p1' } } }]);
  });

  it('an empty message or a bad email is refused on the page (no call), with its own line', () => {
    render(<FeedbackPage context={{}} />);
    send();
    expect(screen.getByRole('alert')).toHaveTextContent(FB_ERRORS['message-empty']);
    type('feedback-message', 'hi');
    type('feedback-email', 'nope');
    send();
    expect(screen.getByRole('alert')).toHaveTextContent(FB_ERRORS['email-shape']);
    expect(calls).toHaveLength(0);
  });

  it('typed failure lines: rate limit, server, network — and no thank-you', async () => {
    render(<FeedbackPage context={{}} />);
    type('feedback-message', 'hi');
    for (const [m, key] of [['rate', 'rate-limited'], ['down', 'server'], ['offline', 'network']] as const) {
      mode = m;
      send();
      expect(await screen.findByText(FB_ERRORS[key])).toHaveAttribute('role', 'alert');
    }
    expect(screen.queryByTestId('feedback-thanks')).toBeNull();
  });

  it('a filled honeypot never gets a thank-you', () => {
    render(<FeedbackPage context={{}} />);
    type('feedback-message', 'hi');
    type('feedback-honeypot', 'http://spam');
    send();
    expect(screen.getByRole('alert')).toHaveTextContent(FB_ERRORS.honeypot);
    expect(calls).toHaveLength(0);
  });
});
