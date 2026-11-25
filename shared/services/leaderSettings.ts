/**
 * leaderSettings.ts — a signed-in leader's settings follow them across devices · 组长设置同步
 *
 * Local-first: every setting is read from and written to localStorage as
 * before; this module mirrors the keys in LEADER_SYNCED_KEYS to the
 * leader_settings row (database/leader-settings-schema.sql, ADR-0005).
 *
 * Rules:
 * - SERVER WINS ON SIGN-IN: pullLeaderSettings() writes every synced key the
 *   row holds over the local value. Then, if the browser holds synced keys
 *   the row lacks, one push merges them up (first sign-in on a configured
 *   device seeds the row).
 * - Every later change (writers call noteLeaderSettingChanged) pushes the
 *   whole local set after PUSH_DEBOUNCE_MS; the row's settings map is
 *   replaced, so a cleared key disappears from the server too.
 * - Not signed in, or Supabase not configured → every call is a no-op that
 *   reports `skipped`; nothing throws. A server error becomes a typed
 *   failure (LeaderSettingsResult) the setup line shows.
 * - The OpenRouter key and the provider are never read here (leaderSettingsKeys).
 *
 * TODO(ADR-0005): services/syncService also mirrors AI_MODEL (and API keys)
 * into user_settings with a newer-timestamp rule; the two can disagree on
 * AI_MODEL for a user who runs the full sync. Retire AI_MODEL from that list
 * in its own session.
 */
import { supabase, authManager, type AuthState } from './supabase';
import { signedInUid } from './sessionUid';
import {
  LEADER_SYNCED_KEYS, type LeaderSyncedKey, setLeaderSettingListener, noteLeaderSettingChanged,
} from './leaderSettingsKeys';

export { LEADER_SYNCED_KEYS, noteLeaderSettingChanged };

export const LEADER_SETTINGS_TABLE = 'leader_settings';
export const PUSH_DEBOUNCE_MS = 1000;

export type LeaderSettings = Partial<Record<LeaderSyncedKey, string>>;

export interface LeaderSettingsFailure {
  step: 'pull' | 'push';
  message: string;
}

export type LeaderSettingsResult =
  | { ok: true; skipped: boolean }
  | { ok: false; failure: LeaderSettingsFailure };

export type LeaderSyncState = 'idle' | 'syncing' | 'synced' | 'failed';
export interface LeaderSyncStatus {
  state: LeaderSyncState;
  failure: LeaderSettingsFailure | null;
}

// ---- Local side · 本地 ---------------------------------------------------------

/** The synced keys with a non-empty local value — exactly what a push sends. */
export function readLocalLeaderSettings(): LeaderSettings {
  const out: LeaderSettings = {};
  for (const key of LEADER_SYNCED_KEYS) {
    const value = (localStorage.getItem(key) ?? '').trim();
    if (value) out[key] = value;
  }
  return out;
}

function applyServerSettings(settings: Record<string, unknown>): void {
  for (const key of LEADER_SYNCED_KEYS) {
    const value = settings[key];
    if (typeof value === 'string' && value.trim()) localStorage.setItem(key, value);
  }
}

/** True when the browser holds a synced key the server row does not. */
function localHasMore(server: Record<string, unknown>): boolean {
  return Object.keys(readLocalLeaderSettings()).some(key => !(key in server));
}

const fail = (step: LeaderSettingsFailure['step'], message: string): LeaderSettingsResult =>
  ({ ok: false, failure: { step, message } });

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

// ---- Server side · 服务器 ----------------------------------------------------

type Fetched = { ok: true; settings: Record<string, unknown> } | { ok: false; message: string };

async function fetchServerSettings(uid: string): Promise<Fetched> {
  try {
    const { data, error } = await supabase!
      .from(LEADER_SETTINGS_TABLE).select('settings').eq('leader_id', uid).maybeSingle();
    if (error) return { ok: false, message: error.message };
    const settings = data?.settings;
    return { ok: true, settings: settings && typeof settings === 'object' ? settings as Record<string, unknown> : {} };
  } catch (e) {
    // Network/transport failure (fetch rejected): surfaced as a typed failure, never thrown (R5).
    return { ok: false, message: errorMessage(e) };
  }
}

/** Server wins: write every synced key the row holds into localStorage. */
export async function pullLeaderSettings(): Promise<LeaderSettingsResult> {
  const uid = signedInUid();
  if (!uid) return { ok: true, skipped: true };
  const fetched = await fetchServerSettings(uid);
  if (fetched.ok === false) return fail('pull', fetched.message);
  applyServerSettings(fetched.settings);
  return { ok: true, skipped: false };
}

/** Upsert the local synced set as the row's whole settings map. */
export async function pushLeaderSettings(): Promise<LeaderSettingsResult> {
  const uid = signedInUid();
  if (!uid) return { ok: true, skipped: true };
  try {
    const { error } = await supabase!.from(LEADER_SETTINGS_TABLE).upsert(
      { leader_id: uid, settings: readLocalLeaderSettings(), updated_at: new Date().toISOString() },
      { onConflict: 'leader_id' },
    );
    return error ? fail('push', error.message) : { ok: true, skipped: false };
  } catch (e) {
    // Same as fetchServerSettings: a rejected request is reported, not thrown (R5).
    return fail('push', errorMessage(e));
  }
}

// ---- Status for the setup line · 状态 ----------------------------------------

let status: LeaderSyncStatus = { state: 'idle', failure: null };
const statusListeners = new Set<(s: LeaderSyncStatus) => void>();

function setStatus(next: LeaderSyncStatus): void {
  status = next;
  statusListeners.forEach(l => l(status));
}

export function getLeaderSyncStatus(): LeaderSyncStatus {
  return status;
}

export function subscribeLeaderSyncStatus(listener: (s: LeaderSyncStatus) => void): () => void {
  statusListeners.add(listener);
  listener(status);
  return () => { statusListeners.delete(listener); };
}

function record(result: LeaderSettingsResult): void {
  if (result.ok === false) setStatus({ state: 'failed', failure: result.failure });
  else setStatus({ state: result.skipped ? 'idle' : 'synced', failure: null });
}

// ---- Debounced push + sign-in handshake · 推送与登录 ---------------------------

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingPush(): void {
  if (pushTimer !== null) clearTimeout(pushTimer);
  pushTimer = null;
}

/** Coalesces a burst of edits into one push PUSH_DEBOUNCE_MS after the last one. */
export function schedulePush(): void {
  if (!signedInUid()) return;
  cancelPendingPush();
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void pushLeaderSettings().then(record);
  }, PUSH_DEBOUNCE_MS);
}

/** Sign-in handshake: pull (server wins), then push once if the browser has keys the row lacks. */
export async function syncOnSignIn(): Promise<LeaderSettingsResult> {
  const uid = signedInUid();
  if (!uid) return { ok: true, skipped: true };
  setStatus({ state: 'syncing', failure: null });
  const fetched = await fetchServerSettings(uid);
  if (fetched.ok === false) { const r = fail('pull', fetched.message); record(r); return r; }
  applyServerSettings(fetched.settings);
  const result = localHasMore(fetched.settings) ? await pushLeaderSettings() : { ok: true as const, skipped: false };
  record(result);
  return result;
}

let stopCurrent: (() => void) | null = null;

/**
 * Wire the change bus and the auth subscription. Idempotent; returns the
 * stop function (tests call it between cases). A sign-in (uid appears or
 * changes) runs syncOnSignIn; a sign-out drops any pending push.
 */
export function startLeaderSettingsSync(): () => void {
  if (stopCurrent) return stopCurrent;
  setLeaderSettingListener(schedulePush);
  let lastUid: string | null = null;
  const unsubscribe = authManager.subscribe((state: AuthState) => {
    const uid = state.isAuthenticated ? state.user?.id ?? null : null;
    if (uid && uid !== lastUid) {
      lastUid = uid;
      void syncOnSignIn();
    } else if (!uid) {
      lastUid = null;
      cancelPendingPush();
      if (status.state !== 'idle') setStatus({ state: 'idle', failure: null });
    }
  });
  stopCurrent = () => {
    unsubscribe();
    setLeaderSettingListener(null);
    cancelPendingPush();
    stopCurrent = null;
  };
  return stopCurrent;
}
