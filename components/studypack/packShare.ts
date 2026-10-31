/**
 * packShare.ts — a pack's member share link · 分享链接 (ADR-0026)
 *
 * The leader turns sharing on for a synced pack; members open
 * "#/view/<token>" on their phones and read the FULL pack, signed out.
 * The token is the secret (22 random base64url chars, generated here) —
 * never the guessable pack id. The one anon read path is the
 * public_shared_pack RPC (database/share-pack-schema.sql); turning sharing
 * off revokes the link at once. All writes ride the owner-only RLS of
 * study_packs; reads here also filter by uid (the packRemote pattern).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseStudyPack, StudyPack } from './packTypes';
import { STUDY_PACKS_TABLE } from '../newstudy/packRemote';
import { PS_ERR_PULL } from '../newstudy/packSyncStrings';
import { NS_SHARE_ERR } from '../newstudy/newStudyStrings';

/** Tokens are 22 base64url chars (16 random bytes); the route and the SQL both refuse shorter strings. */
const TOKEN_PATTERN = '[A-Za-z0-9_-]{16,64}';

/** "#/view/<token>" → the token, anything else → null. */
export function getShareTokenFromHash(hash: string): string | null {
  const match = new RegExp(`^#/view/(${TOKEN_PATTERN})$`).exec(hash);
  return match ? match[1] : null;
}

export function shareHash(token: string): string {
  return `#/view/${token}`;
}

/** Absolute member link, e.g. https://scripturetolife.org/#/view/<token> (signupUrl's shape). */
export function currentShareUrl(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}${shareHash(token)}`;
}

/** A fresh unguessable token: 16 random bytes as 22 base64url chars. */
export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface PackSharing {
  shared: boolean;
  shareToken: string | null;
  /** How many member devices opened the link (markSharedPackViewed counts each once). */
  views: number;
}

/** The pack's sharing state, owner only. */
export async function getPackSharing(client: SupabaseClient, id: string, uid: string): Promise<PackSharing> {
  const { data, error } = await client
    .from(STUDY_PACKS_TABLE).select('shared, share_token, share_views').eq('id', id).eq('leader_id', uid).maybeSingle();
  if (error) throw new Error(`${PS_ERR_PULL}: ${error.message}`);
  const row = data as { shared?: boolean; share_token?: string | null; share_views?: number | null } | null;
  return { shared: !!row?.shared, shareToken: row?.share_token ?? null, views: row?.share_views ?? 0 };
}

/**
 * Turn sharing on (minting a token on first use — an existing one is kept so
 * the link stays stable across off/on) or off (the link stops working; the
 * token stays for a later re-share). Returns the resulting state.
 */
export async function setPackSharing(
  client: SupabaseClient, id: string, uid: string, on: boolean, existing: Pick<PackSharing, 'shareToken' | 'views'>,
): Promise<PackSharing> {
  const shareToken = on ? (existing.shareToken ?? newShareToken()) : existing.shareToken;
  const patch = on ? { shared: true, share_token: shareToken } : { shared: false };
  const { error } = await client.from(STUDY_PACKS_TABLE).update(patch).eq('id', id).eq('leader_id', uid);
  if (error) throw new Error(`${NS_SHARE_ERR}: ${error.message}`);
  return { shared: on, shareToken, views: existing.views };
}

/** One count per member device: the localStorage guard that keeps reloads from inflating share_views. */
export const viewedGuardKey = (token: string) => `stl-share-viewed:${token}`;

/**
 * Count this device once against the share's 查看 view counter. Fire-and-
 * forget analytics: every failure (storage blocked, RPC down) is swallowed
 * on purpose (R5) — a member must never lose the deck over a counter.
 */
export function markSharedPackViewed(client: SupabaseClient, token: string): void {
  try {
    if (localStorage.getItem(viewedGuardKey(token))) return;
    localStorage.setItem(viewedGuardKey(token), '1');
  } catch { return; } // storage unavailable (private mode): skip rather than count every reload
  void client.rpc('public_shared_pack_viewed', { p_token: token }).then(() => {}, () => {});
}

/** The shared pack behind a member link, or null when the token is unknown or sharing is off. */
export async function fetchSharedPack(client: SupabaseClient, token: string): Promise<StudyPack | null> {
  const { data, error } = await client.rpc('public_shared_pack', { p_token: token });
  if (error) throw new Error(`${PS_ERR_PULL}: ${error.message}`);
  return data ? parseStudyPack(data) : null;
}
