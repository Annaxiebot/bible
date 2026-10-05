/**
 * CheckinPage.test.tsx — private vs shared answers · 跟进页测试
 *
 * The anon client is mocked (rpc). The page shows every practice of the member and
 * the kind's question from the pack summary; "Keep private" stores on this
 * device and never calls the network; "Share with leader" calls the
 * share_checkin_answer RPC with the token + kind + text; errors render.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckinPage from '../CheckinPage';
import { PAPER_PAGE_CLASS } from '../../shared/paperStyles';
import { PAPER_HOME_TEST_ID } from '../../shared/PaperHeader';
import { LANDING_HASH } from '../../landing/landingRoute';
import { CHECKIN_CONTEXT_FN, SHARE_ANSWER_FN } from '../../signup/signupSchema';
import { privateAnswerKey, promptFor, kindForToday } from '../checkinClient';
import {
  CK_TITLE, CK_KEEP_PRIVATE, CK_SHARE, CK_KEPT, CK_SHARED, CK_ERR_EMPTY, CK_ERR_SHARE, CK_ERR_LOAD, CK_DEFAULT_QUESTION, CK_KIND_LABEL, CK_QUESTION_LABEL,
} from '../checkinStrings';

const rpcMock = vi.fn();
vi.mock('../../../services/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpcMock(...args) } }));

const ID = '7d4e8b2a-1c3f-4a5b-9e6d-0f1a2b3c4d5e';
const CONTEXT = {
  pack_id: 'local-2026-10-02-jhn3', pack_title: '祂必兴旺 He Must Increase', name: '小明',
  practice_area: '健康 Health', practice_text: '睡前程序 · Wind-down', practice_note: null,
  reflection_lines: ['周二跟进：做了吗？ · Tue: did it happen?', '周四跟进 · Thu', '周末回顾 · Weekend', '隐私 · privacy'],
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
    expect(screen.getByTestId('checkin-question')).toHaveTextContent('做了吗？');
    expect(screen.getByTestId('checkin-question').textContent!.split('周二跟进').length).toBe(2);   // the kind label once (the heading)
    expect(screen.getByRole('button', { name: CK_KEEP_PRIVATE })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CK_SHARE })).toBeInTheDocument();
    expect(promptFor({ reflection_lines: [] }, 'thu')).toBe(CK_DEFAULT_QUESTION);
    expect(['tue', 'thu', 'weekend']).toContain(kindForToday());
  });

  it('paper style like the landing: brand link home, WenKai h1, gold pills for Keep/Share, paper tokens only', async () => {
    render(<CheckinPage signupId={ID} kind="tue" />);
    await screen.findByTestId('checkin-form');
    expect(screen.getByTestId(PAPER_HOME_TEST_ID)).toHaveAttribute('href', LANDING_HASH);
    expect(screen.getByTestId('checkin-page').className).toContain(PAPER_PAGE_CLASS);
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('stl-head');
    expect(screen.getByTestId('checkin-keep').className).toContain('stl-pill stl-pill-ghost');
    expect(screen.getByTestId('checkin-share').className).toContain('stl-pill');
    expect(screen.getByTestId('checkin-page').innerHTML).not.toMatch(/\b(bg|text|border)-(slate|amber)-/);
  });

  it('a new-style row shows every chosen practice with its own text and area; the own version is an extra labelled line', async () => {
    const practices = [{ area: '家庭 Family', practice: '一起吃饭' }, { area: '工作 Work', practice: '写下忧虑' }, { area: '金钱 Money', practice: '记账' }];
    rpcMock.mockResolvedValueOnce({ data: [{ ...CONTEXT, practice_note: ' My own pratice: Diet ', practices }], error: null });
    render(<CheckinPage signupId={ID} kind="tue" />);
    await screen.findByTestId('checkin-form');
    const items = screen.getAllByTestId('checkin-practice-item').map(i => i.textContent);
    expect(items).toEqual(['一起吃饭家庭 Family', '写下忧虑工作 Work', '记账金钱 Money']);
    expect(screen.getByTestId('checkin-own-version')).toHaveTextContent('我的版本 · My own version：My own pratice: Diet');
  });

  it('the weekend question shows the kind once: the doubled "周末回顾：周末:" / "End of week: Weekend:" labels are stripped', async () => {
    const line = '周末回顾：周末:回顾本周… · End of week: Weekend: Looking back…';
    rpcMock.mockResolvedValueOnce({ data: [{ ...CONTEXT, reflection_lines: ['a', 'b', line] }], error: null });
    render(<CheckinPage signupId={ID} kind="weekend" />);
    const question = await screen.findByTestId('checkin-question');
    expect(question).toHaveTextContent(`${CK_QUESTION_LABEL} · ${CK_KIND_LABEL.weekend}`);
    expect(question.querySelectorAll('p')[1]).toHaveTextContent(/^回顾本周… · Looking back…$/);
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
