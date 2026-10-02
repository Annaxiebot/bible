/**
 * leaderRoute.ts — the leader's sign-up list route · 组长路由
 *
 * "#/leader/<packId>" lists a pack's sign-ups (auth required). Pure module,
 * mirrors signupRoute.
 */

export const LEADER_HASH_PREFIX = '#/leader/';

const LEADER_HASH_RE = /^#\/leader\/([A-Za-z0-9._-]+)$/;

export function leaderHash(packId: string): string {
  return `${LEADER_HASH_PREFIX}${packId}`;
}

/** "#/leader/<id>" → pack id, anything else → null. */
export function getLeaderPackIdFromHash(hash: string): string | null {
  const match = LEADER_HASH_RE.exec(hash);
  return match ? match[1] : null;
}
