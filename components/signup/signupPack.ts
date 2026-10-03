/**
 * signupPack.ts — the pack as the sign-up page sees it · 报名页的查经包
 *
 * A member scans the TV QR on their own phone, signed out. For a committed
 * pack, or a leader pack this device already holds (or the signed-in
 * leader's own study_packs row), the same seam TV mode uses answers
 * (packSource). Otherwise a `local-` id falls back to the anon RPC
 * public_signup_pack (database/signup-pack-schema.sql), which returns only
 * the slice this page reads: SignupPack. #/pack (TV) never uses this.
 * Every failure is a SignupPackError with a kind, rendered by SignupPage.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { findLeaderPack, isLocalPackId, loadPack } from '../studypack/packSource';
import { isGoogleFormUrl } from '../studypack/feedbackForm';
import { isLifeMenuRows, type LifeMenuRow, type StudyPack } from '../studypack/packTypes';
import { getSignupClient } from './signupClient';
import { SIGNUP_PACK_FN } from './signupSchema';
import { SU_ERR_NOT_CONFIGURED, SU_PACK_ASK_LEADER, SU_PACK_INVALID } from './signupStrings';

/** What the sign-up page reads from a pack — and all the public projection returns. */
export interface SignupPack extends Pick<StudyPack, 'id' | 'title' | 'passageRef' | 'leaderId' | 'feedbackFormUrl' | 'feedbackFormEntries'> {
  lifeMenu: LifeMenuRow[];
}

export type SignupPackFailure = 'not-found' | 'unconfigured' | 'server' | 'invalid';

export class SignupPackError extends Error {
  constructor(readonly kind: SignupPackFailure, message: string) {
    super(message);
    this.name = 'SignupPackError';
  }
}

export function toSignupPack(pack: StudyPack): SignupPack {
  return {
    id: pack.id,
    title: pack.title,
    passageRef: pack.passageRef,
    leaderId: pack.leaderId,
    feedbackFormUrl: pack.feedbackFormUrl,
    feedbackFormEntries: pack.feedbackFormEntries,
    lifeMenu: pack.sections.find(s => s.kind === 'lifeMenu')?.rows ?? [],
  };
}

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Validate the RPC's JSON; throws an 'invalid' SignupPackError naming the field. */
export function parseSignupPack(raw: unknown, packId: string): SignupPack {
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const bad = (field: string) => new SignupPackError('invalid', `${SU_PACK_INVALID} (${field})`);
  if (p.id !== packId) throw bad('id');
  if (!isText(p.title)) throw bad('title');
  if (!isText(p.leaderId)) throw bad('leaderId');
  if (!isLifeMenuRows(p.lifeMenu)) throw bad('lifeMenu');
  const formUrl = p.feedbackFormUrl ?? undefined;
  if (formUrl !== undefined && !(isText(formUrl) && isGoogleFormUrl(formUrl))) throw bad('feedbackFormUrl');
  const feedbackFormUrl = formUrl as string | undefined;   // narrowed by the check above
  const entries = p.feedbackFormEntries;
  if (entries != null && typeof entries !== 'object') throw bad('feedbackFormEntries');
  return {
    id: packId,
    title: p.title,
    passageRef: typeof p.passageRef === 'string' ? p.passageRef : '',
    leaderId: p.leaderId,
    lifeMenu: p.lifeMenu,
    feedbackFormUrl,
    feedbackFormEntries: (entries ?? undefined) as SignupPack['feedbackFormEntries'],
  };
}

/** The public projection of a leader pack, or null when the server has no such pack. */
export async function fetchPublicSignupPack(client: SupabaseClient, packId: string): Promise<SignupPack | null> {
  const { data, error } = await client.rpc(SIGNUP_PACK_FN, { p_pack_id: packId });
  if (error) throw new SignupPackError('server', error.message);
  return data == null ? null : parseSignupPack(data, packId);
}

/**
 * The sign-up page's pack: committed packs from public/packs; `local-` ids
 * from this device / the signed-in leader first (no RPC then), else the
 * public projection. Throws SignupPackError (or packSource's error for a
 * committed pack that fails to load).
 */
export async function loadSignupPack(packId: string): Promise<SignupPack> {
  if (!isLocalPackId(packId)) return toSignupPack(await loadPack(packId));
  const own = await findLeaderPack(packId);
  if (own) return toSignupPack(own);
  const client = getSignupClient();
  if (!client) throw new SignupPackError('unconfigured', SU_ERR_NOT_CONFIGURED);
  const pub = await fetchPublicSignupPack(client, packId);
  if (!pub) throw new SignupPackError('not-found', SU_PACK_ASK_LEADER);
  return pub;
}
