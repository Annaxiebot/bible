/**
 * CheckinPage.test.tsx — private vs shared answers · 跟进页测试
 *
 * The anon client is mocked (rpc). The page shows the member's practice and
 * the kind's question from the pack summary; "Keep private" stores on this
 * device and never calls the network; "Share with leader" calls the
 * share_checkin_answer RPC with the token + kind + text; errors render.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckinPage from '../CheckinPage';
import { CHECKIN_CONTEXT_FN, SHARE_ANSWER_FN } from '../../signup/signupSchema';
import { privateAnswerKey, promptFor, practiceOf, kindForToday } from '../checkinClient';
import {
  CK_TITLE, CK_KEEP_PRIVATE, CK_SHARE, CK_KEPT, CK_SHARED, CK_ERR_EMPTY, CK_ERR_SHARE, CK_ERR_LOAD, CK_DEFAULT_QUESTION, CK_KIND_LABEL,
} from '../checkinStrings';

const rpcMock = vi.fn();
vi.mock('../../../services/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));

const ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';
const CONTEXT = {
  pack_id: 'local-2026-10-02-jhn3', pack_title: '祂必兴旺 He Must Increase', name: '小明',
  practice_area: '健康 Health', practice_text: '睡前程序 · Wind-down', practice_note: null,
  reflection_lines: ['周二跟进：做了吗？ · Tue: did it happen?', '周四跟进 · Thu', '周末回顾 · Weekend', '隐私 · privacy'],
  feedback_form_url: null,
};

describe('CheckinPage', () => {
  beforeEach(() => {
    rpcMock.mockReset().mockImplementation(async (fn: string) =>
      fn === CHECKIN_CONTEXT_FN ? { data: [CONTEXT], error: null } : { data: 'answer-id', error: null });
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockReset().mockReturnValue(null);
    (window.localStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
  });

  it('shows the practice, the kind\'s question from the summary, and the two buttons', async () => {
    render(<CheckinPage signupId={ID} kind="tue" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(CK_TITLE);
    await screen.findByTestId('checkin-form');
    expect(rpcMock).toHaveBeenCalledWith(CHECKIN_CONTEXT_FN, { p_signup_id: ID });
    expect(screen.getByTestId('checkin-practice')).toHaveTextContent('睡前程序 · Wind-down');
    expect(screen.getByTestId('checkin-question')).toHaveTextContent(CK_KIND_LABEL.tue);
    expect(screen.getByTestId('checkin-question')).toHaveTextContent('周二跟进：做了吗？');
    expect(screen.getByRole('button', { name: CK_KEEP_PRIVATE })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CK_SHARE })).toBeInTheDocument();
    expect(promptFor({ reflection_lines: [] }, 'thu')).toBe(CK_DEFAULT_QUESTION);
    expect(practiceOf({ practice_text: 'menu', practice_note: ' mine ' })).toBe('mine');
    expect(['tue', 'thu', 'weekend']).toContain(kindForToday());
  });

  it('Keep private stores on this device only and never calls the network', async () => {
    render(<CheckinPage signupId={ID} kind="thu" />);
    await screen.findByTestId('checkin-form');
    fireEvent.click(screen.getByRole('button', { name: CK_KEEP_PRIVATE }));
    expect(screen.getByRole('alert')).toHaveTextContent(CK_ERR_EMPTY);
    fireEvent.change(screen.getByTestId('checkin-answer'), { target: { value: ' 做了两晚 ' } });
    fireEvent.click(screen.getByRole('button', { name: CK_KEEP_PRIVATE }));
    expect(window.localStorage.setItem).toHaveBeenCalledWith(privateAnswerKey(ID, 'thu'), '做了两晚');
    expect(screen.getByTestId('checkin-done')).toHaveTextContent(CK_KEPT);
    expect(rpcMock).toHaveBeenCalledTimes(1);   // only the context read
    expect(rpcMock).not.toHaveBeenCalledWith(SHARE_ANSWER_FN, expect.anything());
  });

  it('Share with leader calls the RPC with the token, kind and text; a rejected share is shown', async () => {
    render(<CheckinPage signupId={ID} kind="weekend" />);
    await screen.findByTestId('checkin-form');
    fireEvent.change(screen.getByTestId('checkin-answer'), { target: { value: '有改变' } });
    fireEvent.click(screen.getByRole('button', { name: CK_SHARE }));
    await waitFor(() => expect(screen.getByTestId('checkin-done')).toHaveTextContent(CK_SHARED));
    expect(rpcMock).toHaveBeenCalledWith(SHARE_ANSWER_FN, { p_signup_id: ID, p_kind: 'weekend', p_answer: '有改变' });
    expect(window.localStorage.setItem).not.toHaveBeenCalled();

    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'unknown signup' } });
    fireEvent.change(screen.getByTestId('checkin-answer'), { target: { value: 'again' } });
    fireEvent.click(screen.getByRole('button', { name: CK_SHARE }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`${CK_ERR_SHARE}: unknown signup`);
  });

  it('a previously kept answer is prefilled; an unknown token is a visible error', async () => {
    (window.localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((k: string) => (k === privateAnswerKey(ID, 'tue') ? 'kept' : null));
    render(<CheckinPage signupId={ID} kind="tue" />);
    await screen.findByTestId('checkin-form');
    expect(screen.getByTestId('checkin-answer')).toHaveValue('kept');
    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    render(<CheckinPage signupId="00000000-0000-4000-8000-000000000000" kind={null} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(CK_ERR_LOAD);
  });
});
