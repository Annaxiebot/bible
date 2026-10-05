/**
 * StopPage.test.tsx — the member's stop page and the check-in page's stop link · 停止提醒页测试 (ADR-0009)
 *
 * The anon client is mocked with a fake that behaves like the SQL
 * functions: unsubscribe_signup / resubscribe_signup answer true for a known
 * token (and flip its state), false for an unknown one; checkin_context
 * reports the state. Stop → confirmation → Resume; an unknown token and a
 * failed RPC are visible alerts; the check-in page shows the link while
 * subscribed and the stopped state with Resume once stopped.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StopPage from '../StopPage';
import CheckinPage from '../CheckinPage';
import { checkinStopHash } from '../checkinRoute';
import { CHECKIN_CONTEXT_FN } from '../../signup/signupSchema';
import { UNSUBSCRIBE_FN, RESUBSCRIBE_FN } from '../../../supabase/functions/send-checkins/optout';
import { CK_STOP, CK_STOPPED, CK_RESUME, CK_RESUMED, CK_ERR_STOP, CK_ERR_LOAD } from '../checkinStrings';

const ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';
const UNKNOWN = '00000000-0000-4000-8000-000000000000';
const stoppedAt = new Map<string, string | null>();
let failNext: string | null = null;

/** The SQL functions' contract: p_id only; known token → true + state flip; unknown → false. */
async function fakeRpc(fn: string, args: Record<string, unknown>) {
  if (failNext) { const message = failNext; failNext = null; return { data: null, error: { message } }; }
  if (fn === CHECKIN_CONTEXT_FN) {
    const id = args.p_signup_id as string;
    if (!stoppedAt.has(id)) return { data: [], error: null };
    return { data: [{ pack_id: 'p', pack_title: 'T', name: 'N', practice_area: null, practice_text: 'P', practice_note: null,
      reflection_lines: ['a', 'b', 'c'], feedback_form_url: null, unsubscribed_at: stoppedAt.get(id) }], error: null };
  }
  if (fn !== UNSUBSCRIBE_FN && fn !== RESUBSCRIBE_FN) throw new Error(`unexpected rpc ${fn}`);
  expect(Object.keys(args)).toEqual(['p_id']);
  const id = args.p_id as string;
  if (!stoppedAt.has(id)) return { data: false, error: null };
  stoppedAt.set(id, fn === UNSUBSCRIBE_FN ? '2026-10-04T16:00:00Z' : null);
  return { data: true, error: null };
}
const rpcMock = vi.fn(fakeRpc);
vi.mock('../../../services/supabase', () => ({ supabase: { rpc: (fn: string, args: Record<string, unknown>) => rpcMock(fn, args) } }));

describe('StopPage', () => {
  beforeEach(() => {
    stoppedAt.clear();
    stoppedAt.set(ID, null);
    failNext = null;
    rpcMock.mockClear();
  });

  it('one large Stop button → unsubscribe_signup → the confirmation with Resume; Resume → resubscribe_signup → back on', async () => {
    render(<StopPage signupId={ID} />);
    fireEvent.click(screen.getByRole('button', { name: CK_STOP }));
    expect(await screen.findByTestId('stop-done')).toHaveTextContent(CK_STOPPED);
    expect(rpcMock).toHaveBeenCalledWith(UNSUBSCRIBE_FN, { p_id: ID });
    expect(stoppedAt.get(ID)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: CK_RESUME }));
    expect(await screen.findByTestId('stop-resumed')).toHaveTextContent(CK_RESUMED);
    expect(rpcMock).toHaveBeenLastCalledWith(RESUBSCRIBE_FN, { p_id: ID });
    expect(stoppedAt.get(ID)).toBeNull();
    expect(screen.getByRole('button', { name: CK_STOP })).toBeInTheDocument();   // can stop again
  });

  it('an unknown token is a visible alert, never a false confirmation', async () => {
    render(<StopPage signupId={UNKNOWN} />);
    fireEvent.click(screen.getByRole('button', { name: CK_STOP }));
    expect(await screen.findByRole('alert')).toHaveTextContent(CK_ERR_LOAD);
    expect(screen.queryByTestId('stop-done')).toBeNull();
  });

  it('a failed RPC is a visible alert carrying the message', async () => {
    failNext = 'network down';
    render(<StopPage signupId={ID} />);
    fireEvent.click(screen.getByRole('button', { name: CK_STOP }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`${CK_ERR_STOP}: network down`);
  });
});

describe('CheckinPage stop link + stopped state', () => {
  beforeEach(() => {
    stoppedAt.clear();
    failNext = null;
    rpcMock.mockClear();
  });

  it('subscribed: a small "停止提醒 · Stop these emails" link to #/checkin/<id>/stop', async () => {
    stoppedAt.set(ID, null);
    render(<CheckinPage signupId={ID} kind="tue" />);
    const link = await screen.findByTestId('checkin-stop-link');
    expect(link).toHaveTextContent(CK_STOP);
    expect(link).toHaveAttribute('href', checkinStopHash(ID));
    expect(screen.queryByTestId('checkin-stopped')).toBeNull();
  });

  it('stopped: shows the state with Resume; Resume calls resubscribe_signup and brings the link back', async () => {
    stoppedAt.set(ID, '2026-10-04T16:00:00Z');
    render(<CheckinPage signupId={ID} kind="tue" />);
    expect(await screen.findByTestId('checkin-stopped')).toHaveTextContent(CK_STOPPED);
    expect(screen.queryByTestId('checkin-stop-link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: CK_RESUME }));
    expect(await screen.findByTestId('checkin-stop-link')).toBeInTheDocument();
    expect(rpcMock).toHaveBeenLastCalledWith(RESUBSCRIBE_FN, { p_id: ID });
    expect(stoppedAt.get(ID)).toBeNull();
  });
});
