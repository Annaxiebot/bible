/**
 * leaderSettings.test.ts — settings follow a signed-in leader · 组长设置同步测试
 *
 * The Supabase client and authManager are mocked. Pull writes the synced
 * keys only (server wins); push sends exactly the synced keys that are set
 * locally; a burst of changes coalesces into one push after the debounce;
 * signed-out and unconfigured are no-ops; a sign-in pulls, then pushes only
 * when the browser holds keys the row lacks; a server error (returned or
 * thrown) becomes a typed failure that the status reports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEYS } from '../../constants/storageKeys';

let uid: string | null = null;
let configured = true;
type Listener = (state: unknown) => void;
const authListeners = new Set<Listener>();
const authState = () => ({
  user: uid ? { id: uid, email: 'leader@example.com' } : null,
  session: null, isAuthenticated: !!uid, isLoading: false,
});
const emitAuth = () => authListeners.forEach(l => l(authState()));
const maybeSingleMock = vi.fn();
const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({
  select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
  upsert: upsertMock,
}));
vi.mock('../supabase', () => ({
  get supabase() { return configured ? { from: fromMock } : null; },
  authManager: {
    getState: () => authState(),
    getUserId: () => uid,
    subscribe: (l: Listener) => { authListeners.add(l); l(authState()); return () => authListeners.delete(l); },
  },
  isSupabaseConfigured: () => configured,
}));

import {
  LEADER_SYNCED_KEYS, LEADER_SETTINGS_TABLE, PUSH_DEBOUNCE_MS,
  pullLeaderSettings, pushLeaderSettings, readLocalLeaderSettings, noteLeaderSettingChanged,
  startLeaderSettingsSync, syncOnSignIn, subscribeLeaderSyncStatus, type LeaderSyncStatus,
} from '../leaderSettings';

function makeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    dump: () => ({ ...store }),
  };
}
let storage: ReturnType<typeof makeStorage>;
const serverRow = (settings: Record<string, unknown> | null) => ({ data: settings ? { settings } : null, error: null });
let stop: (() => void) | null = null;

beforeEach(() => {
  uid = 'uid-lead';
  configured = true;
  storage = makeStorage();
  vi.stubGlobal('localStorage', storage);
  maybeSingleMock.mockReset().mockResolvedValue(serverRow(null));
  upsertMock.mockReset().mockResolvedValue({ error: null });
  fromMock.mockClear();
  authListeners.clear();
});
afterEach(() => { stop?.(); stop = null; vi.useRealTimers(); });

describe('synced keys', () => {
  it('are the five leader preferences — never the API key or the provider (ADR-0005)', () => {
    expect([...LEADER_SYNCED_KEYS]).toEqual([
      STORAGE_KEYS.AI_MODEL, STORAGE_KEYS.AI_PACK_MODEL, STORAGE_KEYS.AI_FALLBACK_MODELS,
      STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT, STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL,
    ]);
    expect(LEADER_SYNCED_KEYS).not.toContain(STORAGE_KEYS.OPENROUTER_API_KEY);
    expect(LEADER_SYNCED_KEYS).not.toContain(STORAGE_KEYS.AI_PROVIDER);
  });
});

describe('pullLeaderSettings (server wins)', () => {
  it('writes every synced key the row holds and nothing else; blank values are skipped', async () => {
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'local/model');
    maybeSingleMock.mockResolvedValue(serverRow({
      [STORAGE_KEYS.AI_MODEL]: 'server/model',
      [STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT]: 'bilingual',
      [STORAGE_KEYS.AI_PACK_MODEL]: '   ',
      [STORAGE_KEYS.OPENROUTER_API_KEY]: 'sk-or-leaked',
      [STORAGE_KEYS.AI_PROVIDER]: 'gemini',
      unrelated: 'x',
    }));
    expect(await pullLeaderSettings()).toEqual({ ok: true, skipped: false });
    expect(fromMock).toHaveBeenCalledWith(LEADER_SETTINGS_TABLE);
    expect(storage.dump()).toEqual({
      [STORAGE_KEYS.AI_MODEL]: 'server/model',
      [STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT]: 'bilingual',
    });
  });

  it('leaves local values alone when there is no row yet', async () => {
    storage.setItem(STORAGE_KEYS.AI_PACK_MODEL, 'local/pack');
    expect(await pullLeaderSettings()).toEqual({ ok: true, skipped: false });
    expect(storage.dump()).toEqual({ [STORAGE_KEYS.AI_PACK_MODEL]: 'local/pack' });
  });

  it('a server error becomes a typed pull failure; a thrown request too', async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    expect(await pullLeaderSettings()).toEqual({ ok: false, failure: { step: 'pull', message: 'permission denied' } });
    maybeSingleMock.mockRejectedValue(new Error('Failed to fetch'));
    expect(await pullLeaderSettings()).toEqual({ ok: false, failure: { step: 'pull', message: 'Failed to fetch' } });
  });
});

describe('pushLeaderSettings', () => {
  it('upserts exactly the synced keys that are set locally, keyed by leader_id', async () => {
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'google/gemini-2.5-flash');
    storage.setItem(STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL, 'https://docs.google.com/forms/d/e/x/viewform');
    storage.setItem(STORAGE_KEYS.AI_PACK_MODEL, '  ');
    storage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, 'sk-or-secret');
    storage.setItem(STORAGE_KEYS.AI_PROVIDER, 'openrouter');
    expect(readLocalLeaderSettings()).toEqual({
      [STORAGE_KEYS.AI_MODEL]: 'google/gemini-2.5-flash',
      [STORAGE_KEYS.FEEDBACK_FORM_DEFAULT_URL]: 'https://docs.google.com/forms/d/e/x/viewform',
    });
    expect(await pushLeaderSettings()).toEqual({ ok: true, skipped: false });
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const [row, options] = upsertMock.mock.calls[0];
    expect(row.leader_id).toBe('uid-lead');
    expect(row.settings).toEqual(readLocalLeaderSettings());
    expect(JSON.stringify(row)).not.toContain('sk-or-secret');
    expect(typeof row.updated_at).toBe('string');
    expect(options).toEqual({ onConflict: 'leader_id' });
  });

  it('a server error becomes a typed push failure; a thrown request too', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'row-level security' } });
    expect(await pushLeaderSettings()).toEqual({ ok: false, failure: { step: 'push', message: 'row-level security' } });
    upsertMock.mockRejectedValue(new Error('offline'));
    expect(await pushLeaderSettings()).toEqual({ ok: false, failure: { step: 'push', message: 'offline' } });
  });
});

describe('signed out / not configured: no-ops, no errors', () => {
  it.each([
    ['signed out', () => { uid = null; }],
    ['not configured', () => { configured = false; }],
  ])('%s: pull and push report skipped and never touch the client', async (_label, arrange) => {
    arrange();
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'x');
    expect(await pullLeaderSettings()).toEqual({ ok: true, skipped: true });
    expect(await pushLeaderSettings()).toEqual({ ok: true, skipped: true });
    expect(await syncOnSignIn()).toEqual({ ok: true, skipped: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('a change noted while signed out schedules nothing', async () => {
    uid = null;
    vi.useFakeTimers();
    stop = startLeaderSettingsSync();
    noteLeaderSettingChanged(STORAGE_KEYS.AI_MODEL);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('debounced push on change', () => {
  it('a burst of synced-key changes coalesces into one push after the debounce; an unsynced key does nothing', async () => {
    vi.useFakeTimers();
    stop = startLeaderSettingsSync();
    await vi.advanceTimersByTimeAsync(0); // the sign-in handshake on subscribe
    upsertMock.mockClear();
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'a/b');
    noteLeaderSettingChanged(STORAGE_KEYS.AI_MODEL);
    noteLeaderSettingChanged(STORAGE_KEYS.AI_PACK_MODEL);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    noteLeaderSettingChanged(STORAGE_KEYS.AI_FALLBACK_MODELS);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1);
    expect(upsertMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0].settings).toEqual({ [STORAGE_KEYS.AI_MODEL]: 'a/b' });

    noteLeaderSettingChanged(STORAGE_KEYS.OPENROUTER_API_KEY);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it('without the sync started, a noted change is a silent no-op (local-only visitor)', () => {
    expect(() => noteLeaderSettingChanged(STORAGE_KEYS.AI_MODEL)).not.toThrow();
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe('sign-in handshake', () => {
  it('pulls (server wins), then pushes once because the browser holds a key the row lacks', async () => {
    const calls: string[] = [];
    maybeSingleMock.mockImplementation(async () => { calls.push('pull'); return serverRow({ [STORAGE_KEYS.AI_MODEL]: 'server/model' }); });
    upsertMock.mockImplementation(async () => { calls.push('push'); return { error: null }; });
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'local/model');
    storage.setItem(STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT, 'en-keywords');
    uid = null;
    stop = startLeaderSettingsSync();
    uid = 'uid-lead';
    emitAuth();
    await vi.waitFor(() => expect(calls).toEqual(['pull', 'push']));
    expect(storage.getItem(STORAGE_KEYS.AI_MODEL)).toBe('server/model');
    expect(upsertMock.mock.calls[0][0].settings).toEqual({
      [STORAGE_KEYS.AI_MODEL]: 'server/model',
      [STORAGE_KEYS.CONTENT_LANGUAGE_DEFAULT]: 'en-keywords',
    });
    emitAuth(); // same uid again: no second handshake
    await Promise.resolve();
    expect(maybeSingleMock).toHaveBeenCalledTimes(1);
  });

  it('does not push when the row already holds everything the browser has', async () => {
    maybeSingleMock.mockResolvedValue(serverRow({ [STORAGE_KEYS.AI_MODEL]: 'server/model' }));
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'local/model');
    expect(await syncOnSignIn()).toEqual({ ok: true, skipped: false });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('reports a failed pull through the status and skips the push', async () => {
    const seen: LeaderSyncStatus[] = [];
    const unsub = subscribeLeaderSyncStatus(s => seen.push(s));
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'local/model');
    expect(await syncOnSignIn()).toEqual({ ok: false, failure: { step: 'pull', message: 'permission denied' } });
    expect(upsertMock).not.toHaveBeenCalled();
    expect(seen.at(-1)).toEqual({ state: 'failed', failure: { step: 'pull', message: 'permission denied' } });
    unsub();
  });

  it('start is idempotent and stop detaches the auth subscription and the change bus', async () => {
    const first = startLeaderSettingsSync();
    expect(startLeaderSettingsSync()).toBe(first);
    expect(authListeners.size).toBe(1);
    first();
    expect(authListeners.size).toBe(0);
    vi.useFakeTimers();
    noteLeaderSettingChanged(STORAGE_KEYS.AI_MODEL);
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
