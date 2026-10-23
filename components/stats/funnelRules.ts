/**
 * funnelRules.ts — the anonymous New-study funnel: names, events, limits · 新建查经匿名漏斗规则 (ADR-0025)
 *
 * Single source (R3) for the browser (funnel.ts, funnelSignIn.ts,
 * useGeneration), the admin portal's funnel view, the schema test and the
 * e2e fake. Pure, no imports, so Playwright specs load it.
 * database/funnel-schema.sql repeats the event list and the limits;
 * database/__tests__/funnelSchema.test.ts pins them equal.
 */

export const LOG_FUNNEL_FN = 'log_funnel_event';
export const ADMIN_FUNNEL_FN = 'admin_funnel';

/** Every step counted, in funnel order. */
export const FUNNEL_EVENTS = [
  'new_study_opened',
  'signin_started_google', 'signin_started_email',
  'signin_done_google', 'signin_done_email',
  'generate_pressed',
  'pack_ok', 'pack_failed', 'pack_abandoned',
] as const;
export type FunnelEvent = typeof FUNNEL_EVENTS[number];

export type SignInMethod = 'google' | 'email';
export const SIGN_IN_METHODS: readonly SignInMethod[] = ['google', 'email'];

/** How one generation ended: a pack, an error, or the leader left (Cancel, closed the tab, left the page). */
export type FunnelOutcome = 'ok' | 'failed' | 'abandoned';
export const FUNNEL_OUTCOMES: readonly FunnelOutcome[] = ['ok', 'failed', 'abandoned'];

export const signInStartedEvent = (method: SignInMethod): FunnelEvent => `signin_started_${method}`;
export const signInDoneEvent = (method: SignInMethod): FunnelEvent => `signin_done_${method}`;
export const outcomeEvent = (outcome: FunnelOutcome): FunnelEvent => `pack_${outcome}`;

/** The events that carry a wait in seconds (and only these). */
export const FUNNEL_WAIT_EVENTS: readonly FunnelEvent[] = FUNNEL_OUTCOMES.map(outcomeEvent);

/**
 * Events a reload or a second tap repeats: one browser sends each at most
 * once per FUNNEL_REPEAT_MINUTES. The generation events are one per attempt
 * by construction (the first outcome wins), so they are never dropped.
 */
export const FUNNEL_ONCE_PER_WINDOW: readonly FunnelEvent[] = [
  'new_study_opened', ...SIGN_IN_METHODS.map(signInStartedEvent), ...SIGN_IN_METHODS.map(signInDoneEvent),
];
export const FUNNEL_REPEAT_MINUTES = 10;

/** The server refuses a longer wait (an hour); the browser clamps to it. */
export const FUNNEL_MAX_WAIT_SECONDS = 3600;
/** The server counts at most this many of one event per day. */
export const FUNNEL_DAILY_CEILING = 5000;
/** The admin view's window, in days; the server accepts 1..FUNNEL_MAX_DAYS. */
export const FUNNEL_DAYS = 14;
export const FUNNEL_MAX_DAYS = 92;

const MS_PER_SECOND = 1000;

export function isFunnelEvent(value: unknown): value is FunnelEvent {
  return typeof value === 'string' && (FUNNEL_EVENTS as readonly string[]).includes(value);
}

/** Whole seconds between two Date.now() values, clamped to 0..FUNNEL_MAX_WAIT_SECONDS. */
export function waitSeconds(startMs: number, endMs: number): number {
  return Math.min(FUNNEL_MAX_WAIT_SECONDS, Math.max(0, Math.round((endMs - startMs) / MS_PER_SECOND)));
}
