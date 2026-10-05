/**
 * LeaderOptOut.tsx — stop/resume one member, pause the study · 组长停发与暂停 (ADR-0009)
 *
 * SubscriptionCell sits in each live roster row: "停止提醒 · Stop emails"
 * while subscribed; "已退订 · Unsubscribed" with who once stopped — Resume
 * only for a leader's stop (a member's own stop shows "成员本人已退订 · The
 * member unsubscribed themselves" and no Resume). PauseToggle is the
 * per-study switch (pack_summaries.checkins_paused). Writes go through
 * leaderSubscription; every failure is an inline alert.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import type { UnsubscribedBy } from '../../supabase/functions/send-checkins/optout';
import type { SignupRecord } from './leaderData';
import { leaderSetSubscription, MemberChoiceError, fetchPackPaused, setPackPaused } from './leaderSubscription';
import { LD_STOP, LD_RESUME, LD_UNSUBSCRIBED, LD_BY_MEMBER, LD_BY_LEADER, LD_PAUSE, LD_PAUSED } from './leaderStrings';
import { textStyle, controlStyle } from '../newstudy/newStudyStyles';

const smallButton = 'rounded-lg border border-stl-border px-3 text-stl-text hover:border-stl-gold disabled:opacity-60';
const describe = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Stopped = UnsubscribedBy | null;   // null = subscribed

function initialStop(row: SignupRecord): Stopped {
  if (!row.unsubscribed_at) return null;
  return row.unsubscribed_by === 'member' ? 'member' : 'leader';
}

export const SubscriptionCell: React.FC<{ row: SignupRecord }> = ({ row }) => {
  const [stopped, setStopped] = useState<Stopped>(() => initialStop(row));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = async (stop: boolean) => {
    if (!supabase) return;
    setBusy(true);
    try {
      const now = await leaderSetSubscription(supabase, row.id, stop);
      setStopped(now ? (stopped ?? 'leader') : null);
      setError(null);
    } catch (err) {
      if (err instanceof MemberChoiceError) { setStopped('member'); setError(null); } else setError(describe(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-testid="leader-subscription" className="mt-2 flex flex-col items-start gap-1">
      {stopped === null ? (
        <button type="button" data-testid="leader-stop" disabled={busy} onClick={() => void set(true)}
          className={smallButton} style={controlStyle}>{LD_STOP}</button>
      ) : (
        <>
          <span data-testid="leader-unsubscribed" className="font-semibold text-stl-gold">{LD_UNSUBSCRIBED}</span>
          <span data-testid="leader-unsubscribed-by" className="text-stl-text-2">{stopped === 'member' ? LD_BY_MEMBER : LD_BY_LEADER}</span>
          {stopped === 'leader' && (
            <button type="button" data-testid="leader-resume" disabled={busy} onClick={() => void set(false)}
              className={smallButton} style={controlStyle}>{LD_RESUME}</button>
          )}
        </>
      )}
      {error && <span role="alert" className="text-red-300">{error}</span>}
    </div>
  );
};

/** The study's pause switch; disabled until the current state is read. */
export const PauseToggle: React.FC<{ packId: string; leaderId: string }> = ({ packId, leaderId }) => {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    fetchPackPaused(supabase, packId)
      .then(value => { if (!cancelled) setPaused(value); })
      .catch((err: unknown) => { if (!cancelled) setError(describe(err)); });
    return () => { cancelled = true; };
  }, [packId]);
  const toggle = async () => {
    if (!supabase || paused === null) return;
    const next = !paused;
    try {
      await setPackPaused(supabase, packId, leaderId, next);
      setPaused(next);
      setError(null);
    } catch (err) {
      setError(describe(err));
    }
  };
  return (
    <div data-testid="leader-pause" className="flex flex-col gap-1" style={textStyle}>
      <label className="flex items-center gap-3 text-stl-text">
        <input type="checkbox" role="switch" data-testid="leader-pause-toggle" checked={paused === true}
          disabled={paused === null} onChange={() => void toggle()} className="h-6 w-6 accent-stl-gold" />
        <span>{LD_PAUSE}</span>
      </label>
      {paused && <p role="status" data-testid="leader-paused" className="text-stl-gold">{LD_PAUSED}</p>}
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </div>
  );
};
