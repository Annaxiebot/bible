/**
 * LeaderOptOut.test.tsx — roster Stop/Resume and the study pause · 组长停发与暂停测试 (ADR-0009)
 *
 * services/supabase is mocked with fakes that enforce the SQL rules:
 * leader_set_signup_subscription only for the row's leader (42501
 * otherwise), never resuming a member's own stop (STL01), a stop keeps who
 * stopped first; pack_summaries updates only the owner's row (RLS) and
 * returns the updated rows. The pack-summary sync never carries the pause.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SubscriptionCell, PauseToggle } from '../LeaderOptOut';
import { leaderSetSubscription, MemberChoiceError } from '../leaderSubscription';
import type { SignupRecord } from '../leaderData';
import { packSummaryFrom } from '../../signup/packSummary';
import {
  LEADER_SUBSCRIPTION_FN, MEMBER_CHOICE_ERRCODE, PAUSED_COLUMN, UnsubscribedBy,
} from '../../../supabase/functions/send-checkins/optout';
import {
  LD_STOP, LD_RESUME, LD_UNSUBSCRIBED, LD_BY_MEMBER, LD_BY_LEADER, LD_PAUSE, LD_PAUSED, LD_ERR_PAUSE,
} from '../leaderStrings';

const LEADER = 'uid-lead';
const db = {
  uid: LEADER as string | null,
  signups: new Map<string, { leader: string; at: string | null; by: UnsubscribedBy | null }>(),
  summaries: new Map<string, { leader: string; paused: boolean }>(),
};

/** leader_set_signup_subscription as database/checkin-optout-schema.sql defines it. */
function leaderRpc(fn: string, args: { p_id: string; p_stop: boolean }) {
  if (fn !== LEADER_SUBSCRIPTION_FN) throw new Error(`unexpected rpc ${fn}`);
  const row = db.signups.get(args.p_id);
  if (!row) return { data: null, error: { code: 'P0002', message: 'not found' } };
  if (!db.uid || row.leader !== db.uid) return { data: null, error: { code: '42501', message: 'not your sign-up' } };
  if (args.p_stop) {
    row.by = row.at ? row.by : 'leader';
    row.at ??= '2026-10-04T16:00:00Z';
    return { data: true, error: null };
  }
  if (row.at && row.by === 'member') return { data: null, error: { code: MEMBER_CHOICE_ERRCODE, message: 'member-unsubscribed' } };
  row.at = null; row.by = null;
  return { data: false, error: null };
}

/** pack_summaries select/update under the owner policy (update returns only rows the leader owns). */
function summaries() {
  return {
    select: () => ({ eq: (_c: string, packId: string) => ({
      maybeSingle: async () => {
        const row = db.summaries.get(packId);
        return { data: row && row.leader === db.uid ? { [PAUSED_COLUMN]: row.paused } : null, error: null };
      },
    }) }),
    update: (patch: Record<string, boolean>) => ({ eq: (_a: string, packId: string) => ({ eq: (_b: string, leaderId: string) => ({
      select: async () => {
        const row = db.summaries.get(packId);
        if (!row || row.leader !== leaderId || row.leader !== db.uid) return { data: [], error: null };
        row.paused = patch[PAUSED_COLUMN];
        return { data: [{ pack_id: packId }], error: null };
      },
    }) }) }),
  };
}

vi.mock('../../../services/supabase', () => ({
  supabase: {
    rpc: async (fn: string, args: { p_id: string; p_stop: boolean }) => leaderRpc(fn, args),
    from: (table: string) => { if (table !== 'pack_summaries') throw new Error(table); return summaries(); },
  },
  authManager: { getUserId: () => db.uid },
}));

const record = (id: string, at: string | null, by: UnsubscribedBy | null): SignupRecord => ({
  id, leader_id: LEADER, name: 'N', phone: null, email: 'n@example.org', consent_checkins: true, created_at: '2026-10-02T20:00:00Z',
  practice_area: null, practice_text: null, practice2_area: null, practice2_text: null, practice_note: null,
  unsubscribed_at: at, unsubscribed_by: by,
});

describe('SubscriptionCell', () => {
  beforeEach(() => {
    db.uid = LEADER;
    db.signups.clear();
  });

  it('subscribed → Stop → "已退订 · Unsubscribed" by the leader with Resume → Resume → Stop again', async () => {
    db.signups.set('a', { leader: LEADER, at: null, by: null });
    render(<SubscriptionCell row={record('a', null, null)} />);
    fireEvent.click(screen.getByRole('button', { name: LD_STOP }));
    expect(await screen.findByTestId('leader-unsubscribed')).toHaveTextContent(LD_UNSUBSCRIBED);
    expect(screen.getByTestId('leader-unsubscribed-by')).toHaveTextContent(LD_BY_LEADER);
    expect(db.signups.get('a')).toMatchObject({ by: 'leader' });
    fireEvent.click(screen.getByRole('button', { name: LD_RESUME }));
    expect(await screen.findByRole('button', { name: LD_STOP })).toBeInTheDocument();
    expect(db.signups.get('a')).toEqual({ leader: LEADER, at: null, by: null });
  });

  it('a member\'s own stop shows "成员本人已退订" and no Resume button', () => {
    db.signups.set('m', { leader: LEADER, at: '2026-10-03T00:00:00Z', by: 'member' });
    render(<SubscriptionCell row={record('m', '2026-10-03T00:00:00Z', 'member')} />);
    expect(screen.getByTestId('leader-unsubscribed-by')).toHaveTextContent(LD_BY_MEMBER);
    expect(screen.queryByRole('button', { name: LD_RESUME })).toBeNull();
  });

  it('a stale roster (member stopped since the page loaded): Resume is refused (STL01) and the cell switches to the member state, no alert', async () => {
    db.signups.set('s', { leader: LEADER, at: '2026-10-03T00:00:00Z', by: 'member' });
    render(<SubscriptionCell row={record('s', '2026-10-03T00:00:00Z', 'leader')} />);
    fireEvent.click(screen.getByRole('button', { name: LD_RESUME }));
    expect(await screen.findByText(LD_BY_MEMBER)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: LD_RESUME })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(db.signups.get('s')!.at).not.toBeNull();
  });

  it('another leader\'s row: the RPC refuses (42501) and the error is an alert', async () => {
    db.signups.set('x', { leader: 'someone-else', at: null, by: null });
    render(<SubscriptionCell row={record('x', null, null)} />);
    fireEvent.click(screen.getByRole('button', { name: LD_STOP }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not your sign-up');
    expect(db.signups.get('x')!.at).toBeNull();
  });

  it('leaderSetSubscription maps STL01 to MemberChoiceError', async () => {
    db.signups.set('m', { leader: LEADER, at: 'x', by: 'member' });
    const { supabase } = await import('../../../services/supabase');
    await expect(leaderSetSubscription(supabase as never, 'm', false)).rejects.toBeInstanceOf(MemberChoiceError);
  });
});

describe('PauseToggle', () => {
  beforeEach(() => {
    db.uid = LEADER;
    db.summaries.clear();
  });

  it('reads the current state, toggles pause on and off through pack_summaries, and says what pause means', async () => {
    db.summaries.set('p1', { leader: LEADER, paused: false });
    render(<PauseToggle packId="p1" leaderId={LEADER} />);
    const toggle = screen.getByRole('switch', { name: LD_PAUSE });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(await screen.findByTestId('leader-paused')).toHaveTextContent(LD_PAUSED);
    expect(toggle).toBeChecked();
    expect(db.summaries.get('p1')!.paused).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect(db.summaries.get('p1')!.paused).toBe(false);
  });

  it('starts checked when the pack is already paused', async () => {
    db.summaries.set('p1', { leader: LEADER, paused: true });
    render(<PauseToggle packId="p1" leaderId={LEADER} />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
  });

  it('no summary row yet (or not the owner): the update touches nothing and says so', async () => {
    render(<PauseToggle packId="p-missing" leaderId={LEADER} />);
    const toggle = screen.getByRole('switch');
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    expect(await screen.findByRole('alert')).toHaveTextContent(LD_ERR_PAUSE);
    expect(toggle).not.toBeChecked();
  });

  it('the summary sync never carries the pause, so re-opening a pack cannot un-pause it', () => {
    const row = packSummaryFrom({ id: 'p1', title: 'T', date: '2026-10-02', passageRef: 'R', enVersion: 'BSB', leaderId: LEADER, sections: [] } as never);
    expect(row).not.toBeNull();
    expect(Object.keys(row!)).not.toContain(PAUSED_COLUMN);
  });
});
