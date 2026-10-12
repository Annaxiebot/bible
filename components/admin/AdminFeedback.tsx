/**
 * AdminFeedback.tsx — "意见反馈 Feedback" tab of #/admin · 意见反馈 (ADR-0023)
 *
 * One card per message, newest first: when (local "2026-10-09 15:12", ISO
 * tooltip), where it came from (feedback.ts source labels), the study id
 * when the link carried one, the message (line breaks kept), and a mailto
 * reply link when the sender left an address. Never the ip_hash (the SQL
 * does not return it).
 */
import React from 'react';
import type { AdminFeedback as FeedbackRow } from './adminRules';
import { feedbackSourceLabel } from './adminRules';
import { AD_FEEDBACK_NONE, AD_REPLY_TO, AD_FEEDBACK_PACK } from './adminStrings';
import { localDateTime } from '../leader/leaderTime';
import { textStyle } from '../newstudy/newStudyStyles';

/** Newest first. */
export function newestFeedbackFirst(rows: readonly FeedbackRow[]): FeedbackRow[] {
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

const Card: React.FC<{ row: FeedbackRow }> = ({ row }) => (
  <li data-testid="admin-feedback-card" className="flex flex-col gap-2 rounded-xl border border-stl-border bg-stl-surface px-4 py-3" style={textStyle}>
    <p className="flex flex-wrap gap-x-3 text-stl-text-2">
      <time dateTime={row.created_at} title={row.created_at}>{localDateTime(row.created_at)}</time>
      <span data-testid="admin-feedback-source">{feedbackSourceLabel(row.context)}</span>
      {row.context.pack && <span>{AD_FEEDBACK_PACK}: {row.context.pack}</span>}
    </p>
    <p data-testid="admin-feedback-message" className="whitespace-pre-wrap text-stl-text [overflow-wrap:anywhere]">{row.message}</p>
    {row.email && (
      <p className="text-stl-text-2">
        {AD_REPLY_TO}:{' '}
        <a data-testid="admin-feedback-reply" href={`mailto:${row.email}`} className="text-stl-gold underline underline-offset-4 [overflow-wrap:anywhere]">{row.email}</a>
      </p>
    )}
  </li>
);

export const AdminFeedback: React.FC<{ rows: readonly FeedbackRow[] }> = ({ rows }) => (
  <section data-testid="admin-feedback" className="flex flex-col gap-3">
    {rows.length === 0
      ? <p className="text-stl-text-2" style={textStyle}>{AD_FEEDBACK_NONE}</p>
      : <ul className="flex flex-col gap-3">{newestFeedbackFirst(rows).map(r => <Card key={r.id} row={r} />)}</ul>}
  </section>
);
