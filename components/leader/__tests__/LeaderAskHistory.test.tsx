/**
 * LeaderAskHistory.test.tsx — "问一问记录 · Ask AI history" on #/leader/<id> · 问一问记录测试 (ADR-0021)
 *
 * The data calls (studypack/askHistory) are mocked. Newest first with
 * dates; a question opens its answer; delete one / all ask first and keep
 * the rows when the leader cancels or the delete fails (alert); the
 * replace-oldest permission shows only when on and can be turned off;
 * nothing saved → one quiet line.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import {
  AH_TITLE, AH_NONE, AH_DELETE, AH_DELETE_CONFIRM, AH_DELETE_ALL, AH_DELETE_ALL_CONFIRM, AH_REPLACE_ON, AH_REPLACE_STOP,
  AH_ERR_DELETE, historyCountLine,
} from '../../studypack/askHistoryStrings';
import { compactTime } from '../leaderTime';

const listMock = vi.fn();
const deleteMock = vi.fn();
const deleteAllMock = vi.fn();
const fetchReplaceMock = vi.fn();
const setReplaceMock = vi.fn();
vi.mock('../../studypack/askHistory', () => ({
  listAskHistory: (...a: unknown[]) => listMock(...a),
  deleteAskExchange: (...a: unknown[]) => deleteMock(...a),
  deleteAllAskHistory: (...a: unknown[]) => deleteAllMock(...a),
  fetchReplaceOldest: (...a: unknown[]) => fetchReplaceMock(...a),
  setReplaceOldest: (...a: unknown[]) => setReplaceMock(...a),
}));
vi.mock('../../signup/signupClient', () => ({ getSignupClient: () => ({}) }));

import { AskHistorySection } from '../LeaderAskHistory';

const PACK_ID = 'local-2026-10-09-matt6';
const LEADER_ID = 'uid-lead';
const ROWS = [   // oldest first, as the server lists them
  { id: 'r1', pack_id: PACK_ID, question: '天父知道什么？', answer: '你需用的一切 (v.32).', model: null, created_at: '2026-10-02T20:00:00Z' },
  { id: 'r2', pack_id: PACK_ID, question: 'Why not worry?', answer: 'Each day has enough trouble (v.34).', model: 'm', created_at: '2026-10-09T20:00:00Z' },
];

const confirmSpy = vi.spyOn(window, 'confirm');

beforeEach(() => {
  listMock.mockReset().mockResolvedValue(ROWS);
  deleteMock.mockReset().mockResolvedValue(undefined);
  deleteAllMock.mockReset().mockResolvedValue(undefined);
  fetchReplaceMock.mockReset().mockResolvedValue(false);
  setReplaceMock.mockReset().mockResolvedValue(undefined);
  confirmSpy.mockReset().mockReturnValue(true);
});

const renderSection = () => render(<AskHistorySection packId={PACK_ID} leaderId={LEADER_ID} />);

describe('AskHistorySection', () => {
  it('lists the questions newest first with dates and a count; a question opens its answer in large type', async () => {
    renderSection();
    const items = await screen.findAllByTestId('ask-history-item');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(AH_TITLE);
    expect(screen.getByTestId('ask-history-count')).toHaveTextContent(historyCountLine(2));
    expect(items.map(i => within(i).getByTestId('ask-history-question').textContent)).toEqual(['Why not worry?', '天父知道什么？']);
    expect(items[0]).toHaveTextContent(compactTime(ROWS[1].created_at));
    expect(listMock).toHaveBeenCalledWith(expect.anything(), PACK_ID, LEADER_ID);
    expect(screen.queryByTestId('ask-history-answer')).toBeNull();
    const question = within(items[0]).getByTestId('ask-history-question');
    fireEvent.click(question);
    expect(question).toHaveAttribute('aria-expanded', 'true');
    const answer = within(items[0]).getByTestId('ask-history-answer');
    expect(answer).toHaveTextContent('Each day has enough trouble (v.34).');
    expect(parseFloat(answer.style.fontSize)).toBeGreaterThan(20);
    expect(screen.queryByTestId('ask-history-replace')).toBeNull();   // permission off → not shown
  });

  it('delete one: asks first; cancel keeps it, OK removes it', async () => {
    renderSection();
    const items = await screen.findAllByTestId('ask-history-item');
    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(within(items[0]).getByRole('button', { name: AH_DELETE }));
    expect(confirmSpy).toHaveBeenCalledWith(AH_DELETE_CONFIRM);
    expect(deleteMock).not.toHaveBeenCalled();
    fireEvent.click(within(items[0]).getByRole('button', { name: AH_DELETE }));
    await waitFor(() => expect(screen.getAllByTestId('ask-history-item')).toHaveLength(1));
    expect(deleteMock).toHaveBeenCalledWith(expect.anything(), 'r2', LEADER_ID);
  });

  it('a failed delete keeps the row and says why', async () => {
    deleteMock.mockRejectedValue(new Error(`${AH_ERR_DELETE}: offline`));
    renderSection();
    const items = await screen.findAllByTestId('ask-history-item');
    fireEvent.click(within(items[0]).getByRole('button', { name: AH_DELETE }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`${AH_ERR_DELETE}: offline`);
    expect(screen.getAllByTestId('ask-history-item')).toHaveLength(2);
  });

  it('delete all: asks first, then the quiet empty line', async () => {
    renderSection();
    await screen.findAllByTestId('ask-history-item');
    fireEvent.click(screen.getByRole('button', { name: AH_DELETE_ALL }));
    expect(confirmSpy).toHaveBeenCalledWith(AH_DELETE_ALL_CONFIRM);
    expect(await screen.findByTestId('ask-history-none')).toHaveTextContent(AH_NONE);
    expect(deleteAllMock).toHaveBeenCalledWith(expect.anything(), PACK_ID, LEADER_ID);
  });

  it('the replace-oldest permission is shown when on and can be turned off', async () => {
    fetchReplaceMock.mockResolvedValue(true);
    renderSection();
    expect(await screen.findByTestId('ask-history-replace')).toHaveTextContent(AH_REPLACE_ON);
    fireEvent.click(screen.getByRole('button', { name: AH_REPLACE_STOP }));
    await waitFor(() => expect(screen.queryByTestId('ask-history-replace')).toBeNull());
    expect(setReplaceMock).toHaveBeenCalledWith(expect.anything(), PACK_ID, LEADER_ID, false);
  });

  it('nothing saved: one quiet line, no Delete all', async () => {
    listMock.mockResolvedValue([]);
    renderSection();
    expect(await screen.findByTestId('ask-history-none')).toHaveTextContent(AH_NONE);
    expect(screen.queryByRole('button', { name: AH_DELETE_ALL })).toBeNull();
  });

  it('a failed load is an alert', async () => {
    listMock.mockRejectedValue(new Error('读取问一问记录失败 · Could not load the Ask AI history: rls'));
    renderSection();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the Ask AI history: rls');
  });
});
