/**
 * packSource.ts — where the check-in text comes from · 提醒内容来源
 *
 * Pure (vitest-covered; the readers are injected). Order: the owner's
 * pack_summaries row (written by the leader's browser; the only copy of a
 * local pack's text the server ever sees) first; the public pack JSON on
 * scripturetolife.org second, for committed packs that have no summary
 * (the sample). Neither → a contextual error. A summary's verses (ADR-0004
 * §12) become CheckinPack.passage; a row without them (summarised before
 * 2026-10-05) gives no passage and the email is unchanged.
 */
import {
  CheckinPack, CheckinPassage, PassageVerse, promptsFromPack, REFLECTION_LINE_INDEX, CHECKIN_KINDS,
} from './templates.ts';

export const PACK_SUMMARIES_TABLE = 'pack_summaries';
export const SUMMARY_COLUMNS = 'pack_id, leader_id, title, passage_ref, reflection_lines, checkins_paused, verses, key_verse';

export interface PackSummaryRow {
  pack_id: string;
  leader_id: string;
  title: string;
  reflection_lines: string[];
  checkins_paused?: boolean | null;   // the leader's per-pack pause (ADR-0009)
  passage_ref?: string | null;
  verses?: unknown;                   // JSONB [{num, cuv, en}]; NULL on an older row
  key_verse?: number | null;
}

function isPassageVerse(value: unknown): value is PassageVerse {
  const v = value as PassageVerse;
  return typeof v === 'object' && v !== null && Number.isInteger(v.num)
    && typeof v.cuv === 'string' && v.cuv.length > 0 && typeof v.en === 'string' && v.en.length > 0;
}

/**
 * The row's passage, or undefined when it has no usable verses. A malformed
 * verses value is treated as absent on purpose: the reminder itself must
 * still go out, and the leader's next save rewrites the row.
 */
export function passageFromSummary(row: PackSummaryRow): CheckinPassage | undefined {
  const verses = row.verses;
  if (!Array.isArray(verses) || verses.length === 0 || !verses.every(isPassageVerse)) return undefined;
  return { ref: row.passage_ref ?? '', verses, keyVerse: Number.isInteger(row.key_verse) ? row.key_verse as number : null };
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
  const passage = passageFromSummary(row);
  return {
    id: row.pack_id,
    title: row.title,
    leaderId: row.leader_id,
    prompts: {
      tue: lines[REFLECTION_LINE_INDEX.tue],
      thu: lines[REFLECTION_LINE_INDEX.thu],
      weekend: lines[REFLECTION_LINE_INDEX.weekend],
    },
    paused: row.checkins_paused === true,
    ...(passage ? { passage } : {}),
  };
}

export async function loadCheckinPack(packId: string, readers: PackReaders): Promise<CheckinPack> {
  const summary = await readers.readSummary(packId);
  if (summary) return packFromSummary(summary);
  const raw = await readers.fetchPublic(packId);
  if (raw !== null) return promptsFromPack(raw);
  throw new Error(`Pack ${packId}: no pack_summaries row (open #/leader/${packId} once while signed in) and not public`);
}
