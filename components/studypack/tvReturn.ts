/**
 * tvReturn.ts — where TV mode goes back to on exit · 退出演示的去向
 *
 * The editor's Preview remembers "#/new/<packId>" in sessionStorage before
 * opening "#/pack/<packId>"; Escape / ✕ in TV mode takes that hash back
 * (once) instead of the app. The record is keyed by pack id so a stale
 * entry can never redirect a pack opened directly from the landing. Storage
 * is injectable: the unit tests pass a plain object, the app passes
 * window.sessionStorage.
 */

export const TV_RETURN_KEY = 'tv-return';

/** Today's default exit: the app at the root. */
export const TV_EXIT_DEFAULT_HASH = '';

export interface ReturnStore {
  getItem(key: string): string | null | undefined;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface ReturnRecord {
  packId: string;
  hash: string;
}

export function rememberTvReturn(packId: string, hash: string, store: ReturnStore = window.sessionStorage): void {
  const record: ReturnRecord = { packId, hash };
  store.setItem(TV_RETURN_KEY, JSON.stringify(record));
}

function readRecord(store: ReturnStore): ReturnRecord | null {
  const raw = store.getItem(TV_RETURN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ReturnRecord>;
    return typeof parsed.packId === 'string' && typeof parsed.hash === 'string' ? { packId: parsed.packId, hash: parsed.hash } : null;
  } catch {
    // A corrupt record is treated as "no origin": the caller falls back to the default exit, which is visible behaviour.
    return null;
  }
}

/**
 * The hash to exit to for this pack: the remembered origin when it was
 * stored for the same pack (consumed on read), else the default. A record
 * for another pack is left alone — it belongs to that pack's editor session.
 */
export function takeTvReturn(packId: string, store: ReturnStore = window.sessionStorage): string {
  const record = readRecord(store);
  if (!record || record.packId !== packId) return TV_EXIT_DEFAULT_HASH;
  store.removeItem(TV_RETURN_KEY);
  return record.hash;
}
