/**
 * packSource.ts — where the check-in text comes from · 提醒内容来源
 *
 * Pure (vitest-covered; the readers are injected). Order: the owner's
 * pack_summaries row (written by the leader's browser; the only copy of a
 * local pack's text the server ever sees) first; the public pack JSON on
 * scripturetolife.org second, for committed packs that have no summary
 * (the sample). Neither → a contextual error.
 */
import { CheckinPack, FeedbackFormEntries, promptsFromPack, REFLECTION_LINE_INDEX, CHECKIN_KINDS } from './templates.ts';

export const PACK_SUMMARIES_TABLE = 'pack_summaries';
export const SUMMARY_COLUMNS = 'pack_id, leader_id, title, reflection_lines, feedback_form_url, feedback_form_entries, checkins_paused';

export interface PackSummaryRow {
  pack_id: string;
  leader_id: string;
  title: string;
  reflection_lines: string[];
  feedback_form_url?: string | null;
  feedback_form_entries?: FeedbackFormEntries | null;
  checkins_paused?: boolean | null;   // the leader's per-pack pause (ADR-0009)
}

export interface PackReaders {
  readSummary: (packId: string) => Promise<PackSummaryRow | null>;
  fetchPublic: (packId: string) => Promise<unknown | null>;
}

/** A summary row → CheckinPack. Throws when the row has fewer than three reflection lines. */
export function packFromSummary(row: PackSummaryRow): CheckinPack {
  const lines = row.reflection_lines;
  if (!Array.isArray(lines) || lines.length < CHECKIN_KINDS.length) {
    throw new Error(`Summary for ${row.pack_id} has no ${CHECKIN_KINDS.length} reflection lines`);
  }
  return {
    id: row.pack_id,
    title: row.title,
    leaderId: row.leader_id,
    prompts: {
      tue: lines[REFLECTION_LINE_INDEX.tue],
      thu: lines[REFLECTION_LINE_INDEX.thu],
      weekend: lines[REFLECTION_LINE_INDEX.weekend],
    },
    feedbackFormUrl: row.feedback_form_url ?? null,
    feedbackFormEntries: row.feedback_form_entries ?? null,
    paused: row.checkins_paused === true,
  };
}

export async function loadCheckinPack(packId: string, readers: PackReaders): Promise<CheckinPack> {
  const summary = await readers.readSummary(packId);
  if (summary) return packFromSummary(summary);
  const raw = await readers.fetchPublic(packId);
  if (raw !== null) return promptsFromPack(raw);
  throw new Error(`Pack ${packId}: no pack_summaries row (open #/leader/${packId} once while signed in) and not public`);
}
