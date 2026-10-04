/**
 * sharingData.ts — what last week's sharing may be built from · 上周分享数据
 *
 * ADR-0008. Reads run as the signed-in leader through the same queries the
 * leader page uses (leaderData.fetchSignups / fetchAnswers: RLS
 * leader_id = auth.uid() plus a client-side uid filter). checkin_answers
 * holds only answers a member chose to "Share with leader" (private ones
 * never leave the member's phone, ADR-0004 §7), so every row read is shared.
 *
 * The material returned carries NO identifiers: practice counts per life
 * area, answer TEXT only (scrubbed of the pack's names / emails / phones and
 * of anything email- or phone-shaped), and the previous pack's closing
 * question. Names, emails, phones and signup ids stay inside this module
 * (the scrubber closure, kept for checking the AI's reply too).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudyPack } from '../studypack/packTypes';
import { fetchSignups, fetchAnswers, commitmentCounts } from '../leader/leaderData';
import { ownPacksNewestFirst } from '../leader/leaderHomeData';
import { packSummaryFrom } from '../signup/packSummary';
import { makeScrubber } from './sharingScrub';
import type { PracticeCount } from './sharingStrings';

/** At most this many answers go to the AI (newest first), each cut to MAX_ANSWER_CHARS — well inside the proxy's 60k cap. */
export const MAX_SHARED_ANSWERS = 40;
export const MAX_ANSWER_CHARS = 500;

export interface SharingMaterial {
  practices: PracticeCount[];
  sharedAnswers: string[];
  closingQuestion: string | null;
  /** The same scrubber, for the AI's reply (defence in depth; holds the identifiers in its closure only). */
  scrub: (text: string) => string;
}

/**
 * The default previous pack: the leader's newest pack dated on or before the
 * current one (other than it); when every other pack is dated later, the
 * newest of those. Candidates are listed newest first for the select.
 */
export function previousPackCandidates(packs: StudyPack[], current: StudyPack, uid: string): StudyPack[] {
  return ownPacksNewestFirst(packs, uid).filter(p => p.id !== current.id);
}

export function defaultPreviousPack(candidates: StudyPack[], current: StudyPack): StudyPack | null {
  return candidates.find(p => p.date <= current.date) ?? candidates[0] ?? null;
}

/** Load and anonymise the previous pack's sign-ups and shared answers. Throws the leaderData bilingual load error. */
export async function loadSharingMaterial(client: SupabaseClient, previous: StudyPack, uid: string): Promise<SharingMaterial> {
  const [signups, answers] = await Promise.all([
    fetchSignups(client, previous.id, uid),
    fetchAnswers(client, previous.id, uid),
  ]);
  const scrub = makeScrubber(signups);
  const sharedAnswers = answers
    .slice(0, MAX_SHARED_ANSWERS)
    .map(a => scrub(a.answer.trim()).slice(0, MAX_ANSWER_CHARS))
    .filter(text => text.length > 0);
  return {
    practices: commitmentCounts(signups),
    sharedAnswers,
    closingQuestion: packSummaryFrom(previous)?.closing_question ?? null,
    scrub,
  };
}
