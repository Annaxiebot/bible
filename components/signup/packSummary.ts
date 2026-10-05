/**
 * packSummary.ts — the slice of a pack the check-in sender needs · 查经包摘要
 *
 * Packs live only in the leader's browser (IndexedDB), so the send-checkins
 * edge function cannot read them. The owning leader's client upserts a
 * small summary row — title, passage, the three reflection lines, the
 * closing question, and the passage's verses (copied from the scripture
 * section: the bundled 和合本 + BSB text, never regenerated) with the key
 * verse's number, so the check-in email can quote them — into pack_summaries (RLS:
 * leader_id = auth.uid()). The full pack is stored owner-only in
 * study_packs (ADR-0006); anon sees only this row's check-in wording via
 * the function and the sign-up projection public_signup_pack (ADR-0006 §9). One
 * helper, called from the leader page, the QR (TV slide + landing), the
 * editor save and the sign-in claim.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PackVerse, StudyPack } from '../studypack/packTypes';
import { supabase, authManager } from '../../services/supabase';
import { SU_SUMMARY_FAILED } from './signupStrings';

export const PACK_SUMMARIES_TABLE = 'pack_summaries';

export interface PackSummaryRow {
  pack_id: string;
  leader_id: string;
  title: string;
  passage_ref: string;
  reflection_lines: string[];
  closing_question: string | null;
  verses: PackVerse[];       // every verse of the scripture section(s), in order (database/summary-verses-schema.sql)
  key_verse: number | null;  // the keyPhrase's verse number, when it names one of those verses
}

/**
 * The verse number a keyPhrase ends with: packAssembly writes
 * "「中文」 “English” (v.7)". The SQL backfill in summary-verses-schema.sql
 * uses the same pattern (pinned by a test).
 */
export const KEY_VERSE_PATTERN = /\(v\.(\d+)\)\s*$/;

/** The keyPhrase's verse number when it is one of `verses`; null otherwise. */
export function keyVerseNumber(keyPhrase: string | undefined, verses: PackVerse[]): number | null {
  const match = keyPhrase ? KEY_VERSE_PATTERN.exec(keyPhrase) : null;
  const num = match ? Number(match[1]) : null;
  return num !== null && verses.some(v => v.num === num) ? num : null;
}

/** The summary row for an owned pack; null for a demo pack (nothing to send for). */
export function packSummaryFrom(pack: StudyPack): PackSummaryRow | null {
  if (!pack.leaderId) return null;
  const reflection = pack.sections.find(s => s.kind === 'reflection');
  const closing = pack.sections.find(s => s.kind === 'closing');
  const scripture = pack.sections.filter(s => s.kind === 'scripture');
  const verses = scripture.flatMap(s => s.verses ?? []).map(({ num, cuv, en }) => ({ num, cuv, en }));
  const keyPhrase = scripture.map(s => s.keyPhrase).find(k => k && KEY_VERSE_PATTERN.test(k));
  return {
    pack_id: pack.id,
    leader_id: pack.leaderId,
    title: pack.title,
    passage_ref: pack.passageRef,
    reflection_lines: reflection?.body ?? [],
    closing_question: closing?.body?.[closing.body.length - 1] ?? null,
    verses,
    key_verse: keyVerseNumber(keyPhrase, verses),
  };
}

/** Upsert the summary (keyed by pack_id). Resolves false for a demo pack; throws on a PostgREST error. */
export async function upsertPackSummary(client: SupabaseClient, pack: StudyPack): Promise<boolean> {
  const row = packSummaryFrom(pack);
  if (!row) return false;
  const { error } = await client.from(PACK_SUMMARIES_TABLE).upsert(row, { onConflict: 'pack_id' });
  if (error) throw new Error(`${SU_SUMMARY_FAILED}: ${error.message}`);
  return true;
}

export type SummarySync =
  | { status: 'skipped' }   // signed out, unconfigured, demo pack, or not this user's pack
  | { status: 'synced' }
  | { status: 'failed'; message: string };

/**
 * Sync through the app's session when the signed-in user owns the pack
 * (RLS would reject anyone else). Failures are returned, not thrown, so
 * every caller renders them (SU_SUMMARY_FAILED) instead of dropping them.
 */
export async function syncPackSummary(pack: StudyPack): Promise<SummarySync> {
  if (!supabase || !pack.leaderId || authManager.getUserId() !== pack.leaderId) return { status: 'skipped' };
  try {
    await upsertPackSummary(supabase, pack);
    return { status: 'synced' };
  } catch (err) {
    return { status: 'failed', message: err instanceof Error ? err.message : String(err) };
  }
}
