/**
 * leaderRoute.ts — the leader's sign-up list route · 组长路由
 *
 * "#/leader" is the leader home (my packs, ADR-0006); "#/leader/<packId>"
 * lists a pack's sign-ups. Both need sign-in. Pure module, mirrors
 * signupRoute.
 */

export const LEADER_HOME_HASH = '#/leader';
export const LEADER_HASH_PREFIX = `${LEADER_HOME_HASH}/`;

const LEADER_HASH_RE = /^#\/leader\/([A-Za-z0-9._-]+)$/;

export function leaderHash(packId: string): string {
  return `${LEADER_HASH_PREFIX}${packId}`;
}

/** "#/leader/<id>" → pack id, anything else → null. */
export function getLeaderPackIdFromHash(hash: string): string | null {
  const match = LEADER_HASH_RE.exec(hash);
  return match ? match[1] : null;
}

/** "#/leader" exactly (no pack id) → the leader home. */
export function isLeaderHomeHash(hash: string): boolean {
  return hash === LEADER_HOME_HASH;
}
