/**
 * useMeetingTracker.ts — count a TV presentation as a group meeting · 记录小组聚会 (ADR-0012)
 *
 * While a pack is presented, visible time accumulates (the
 * visibilitychange event pauses it when the tab or screen is hidden). Once
 * MEETING_MIN_SECONDS of visible time have passed, the hook calls
 * log_presentation(pack, seconds) ONCE for this presentation. The demo pack
 * (SAMPLE_PACK_ID) never counts, so visitors trying the landing demo do not
 * inflate the numbers; the server also refuses packs that are not saved
 * leader packs and more than one row per pack per 2 hours.
 */
import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSignupClient } from '../signup/signupClient';
import { SAMPLE_PACK_ID } from '../landing/landingRoute';
import { LOG_PRESENTATION_FN, MEETING_MIN_SECONDS } from './statsRules';

const MS_PER_SECOND = 1000;

/** Record one meeting. Never throws: the stats are non-essential (see the catch). */
export async function logPresentation(client: SupabaseClient | null, packId: string, seconds: number): Promise<void> {
  if (!client) return;
  try {
    const { error } = await client.rpc(LOG_PRESENTATION_FN, { p_pack_id: packId, p_seconds: seconds });
    if (error) throw new Error(error.message);
  } catch {
    // Silent on purpose (R5 (c)): the counter is a nice-to-have total. A
    // failed or offline call must never interrupt or decorate a meeting in
    // progress, and there is nothing the group could do about it.
  }
}

/** Start counting visible time for `packId` while `active` (the pack loaded); log once at the threshold. */
export function useMeetingTracker(packId: string, active: boolean): void {
  useEffect(() => {
    if (!active || packId === SAMPLE_PACK_ID) return;
    let visibleMs = 0;
    let since: number | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;

    const pause = () => {
      if (since === null) return;
      visibleMs += Date.now() - since;
      since = null;
      clearTimeout(timer);
    };
    const fire = () => {
      pause();
      done = true;
      const seconds = Math.max(MEETING_MIN_SECONDS, Math.floor(visibleMs / MS_PER_SECOND));
      void logPresentation(getSignupClient(), packId, seconds);
    };
    const resume = () => {
      if (done || since !== null) return;
      since = Date.now();
      timer = setTimeout(fire, Math.max(0, MEETING_MIN_SECONDS * MS_PER_SECOND - visibleMs));
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? pause() : resume());

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(timer);
    };
  }, [packId, active]);
}
