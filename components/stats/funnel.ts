/**
 * funnel.ts — count one step of the New-study funnel, anonymously · 匿名漏斗计数 (ADR-0025)
 *
 * trackFunnel(event, wait?) posts { p_event, p_wait_seconds } to
 * log_funnel_event (database/funnel-schema.sql) with the public anon key
 * only — no session token, no id of any kind — so nothing sent can be tied
 * to a person or to another count. The server validates and counts.
 * `fetch(..., { keepalive: true })` lets an "abandoned" sent from pagehide
 * outlive the closing page (supabase-js cannot set keepalive per call; the
 * headers below are the ones it sends for a signed-out caller).
 *
 * Repeats: the page-open and sign-in events are sent at most once per
 * FUNNEL_REPEAT_MINUTES per browser (the last-sent time per event, in
 * localStorage — or this page's memory when storage is blocked). Generation
 * events are one per attempt by construction (startGenerationFunnel: the
 * first outcome wins), so they are never dropped.
 *
 * Production builds send to the build's Supabase project; dev builds and
 * tests only to the dev-only e2e base (window.__SUPABASE_E2E__), so local
 * runs never count on the live site. Never throws, never shows anything:
 * the counts are the owner's, and must never get in a leader's way.
 */
import { useEffect } from 'react';
import { e2eSupabaseBase, type E2ESupabaseBase } from '../../services/e2eSupabase';
import { getNewStudyPackIdFromHash } from '../landing/landingRoute';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import {
  LOG_FUNNEL_FN, FUNNEL_ONCE_PER_WINDOW, FUNNEL_REPEAT_MINUTES, outcomeEvent, waitSeconds,
  type FunnelEvent, type FunnelOutcome,
} from './funnelRules';

export type FunnelBase = E2ESupabaseBase;
interface FunnelEnv { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }
type FunnelStore = Pick<Storage, 'getItem' | 'setItem'>;

const MS_PER_MINUTE = 60 * 1000;
export const FUNNEL_REPEAT_MS = FUNNEL_REPEAT_MINUTES * MS_PER_MINUTE;

/** Where counts go: a production build → its own project; dev builds and tests → only the dev-only e2e base. */
export function funnelBase(dev: boolean = import.meta.env.DEV, env: FunnelEnv = import.meta.env): FunnelBase | null {
  if (dev) return e2eSupabaseBase();
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** localStorage, or null where touching it throws (blocked site data). */
export function browserStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    // No storage at all: the repeat window falls back to this page's memory (claimRepeatWindow).
    return null;
  }
}

/** Last-sent times kept in this page too, so blocked storage still drops StrictMode / quick repeats. */
const memorySent: Partial<Record<FunnelEvent, number>> = {};

function storedSent(store: FunnelStore | null): Partial<Record<FunnelEvent, number>> {
  if (!store) return {};
  try {
    const parsed = JSON.parse(store.getItem(STORAGE_KEYS.FUNNEL_LAST_SENT) ?? '{}') as unknown;
    return typeof parsed === 'object' && parsed !== null ? parsed as Partial<Record<FunnelEvent, number>> : {};
  } catch {
    // Unreadable record or blocked storage: memory alone decides (R5 (c): at worst one extra count).
    return {};
  }
}

function storeSent(store: FunnelStore | null, event: FunnelEvent, now: number): void {
  if (!store) return;
  try {
    store.setItem(STORAGE_KEYS.FUNNEL_LAST_SENT, JSON.stringify({ ...storedSent(store), [event]: now }));
  } catch {
    // Storage full or blocked: memory still holds the time for this page (R5 (c): at worst one extra count).
  }
}

/**
 * True when `event` may be sent now, and records it; false for a repeat
 * inside the window (either direction, so a clock set back cannot block a
 * browser for good).
 */
export function claimRepeatWindow(event: FunnelEvent, now = Date.now(), store: FunnelStore | null = browserStore()): boolean {
  const last = Math.max(memorySent[event] ?? 0, Number(storedSent(store)[event]) || 0);
  if (last > 0 && Math.abs(now - last) < FUNNEL_REPEAT_MS) return false;
  memorySent[event] = now;
  storeSent(store, event, now);
  return true;
}

/** Tests only: forget this page's last-sent times. */
export function resetFunnelMemory(): void {
  for (const key of Object.keys(memorySent)) delete memorySent[key as FunnelEvent];
}

/** One POST to log_funnel_event. Never throws (see the catch). */
export async function postFunnelEvent(
  base: FunnelBase, event: FunnelEvent, wait: number | null, fetchFn: typeof fetch = fetch,
): Promise<void> {
  try {
    await fetchFn(`${base.url.replace(/\/+$/, '')}/rest/v1/rpc/${LOG_FUNNEL_FN}`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', apikey: base.anonKey, Authorization: `Bearer ${base.anonKey}` },
      body: JSON.stringify({ p_event: event, p_wait_seconds: wait }),
    });
  } catch {
    // Silent on purpose (R5 (c)): the funnel is the owner's aggregate, a nice-to-have. An offline
    // or refused count must never interrupt or decorate what the leader is doing, and there is
    // nothing they could do about it.
  }
}

/** Count `event` (with the wait for a generation outcome); repeatable events go through the window. */
export function trackFunnel(event: FunnelEvent, wait: number | null = null): void {
  const base = funnelBase();
  if (!base) return;
  if (FUNNEL_ONCE_PER_WINDOW.includes(event) && !claimRepeatWindow(event)) return;
  void postFunnelEvent(base, event, wait);
}

export interface GenerationFunnel {
  /** Report how this generation ended; only the first call counts. */
  settle: (outcome: FunnelOutcome) => void;
}

type HideTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/**
 * Generate was pressed: count it, start the wait clock, and count the page
 * closing or navigating away before an outcome (pagehide) as abandoned.
 */
export function startGenerationFunnel(now: () => number = Date.now, target: HideTarget = window): GenerationFunnel {
  trackFunnel('generate_pressed');
  const startedAt = now();
  let settled = false;
  const onHide = () => settle('abandoned');
  function settle(outcome: FunnelOutcome) {
    if (settled) return;
    settled = true;
    target.removeEventListener('pagehide', onHide);
    trackFunnel(outcomeEvent(outcome), waitSeconds(startedAt, now()));
  }
  target.addEventListener('pagehide', onHide);
  return { settle };
}

/** Count "New study opened" once per mount of the form route (#/new, not an editor's #/new/<id>). */
export function useNewStudyOpened(): void {
  useEffect(() => {
    if (!getNewStudyPackIdFromHash(window.location.hash)) trackFunnel('new_study_opened');
  }, []);
}
