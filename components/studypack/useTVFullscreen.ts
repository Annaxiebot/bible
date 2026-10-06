/**
 * useTVFullscreen.ts — full screen in TV mode · 演示全屏
 *
 * - The click that opened TV mode requests full screen itself (editor
 *   Preview, leader Present: fullscreen.ts). Entry points we do not own (a
 *   plain link) are covered here: on mount, if that click is still a valid
 *   gesture, the request is made now.
 * - Key F toggles full screen — not with Cmd/Ctrl/Alt, not while typing,
 *   not while Ask AI is open (`keysEnabled`).
 * - A one-time hint (4 s, remembered in localStorage) once the deck is
 *   shown windowed: "按 F 全屏 · Press F for full screen"; on an upright
 *   phone with no full-screen API (iPhone): "横屏观看更佳 · Turn the phone sideways".
 * - Escape in full screen is the browser's: it leaves full screen. The
 *   view asks escapeOnlyLeavesFullscreen() before its own Escape (back to
 *   the editor) so one press never does both, whether the keydown arrives
 *   before the browser's exit or just after it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../../constants/storageKeys';
import {
  FULLSCREEN_EVENTS, fullscreenElement, fullscreenSupported, requestFullscreen, exitFullscreen,
  toggleFullscreen, hasTransientActivation,
} from './fullscreen';
import { PORTRAIT_PHONE_QUERY } from './slideTypography';
import { FULLSCREEN_HINT, SIDEWAYS_HINT } from './tvHints';

export const FULLSCREEN_HINT_MS = 4000;
/** An Escape keydown this soon after leaving full screen belongs to that exit. */
export const ESCAPE_GRACE_MS = 500;

export interface TVFullscreen {
  /** The one-time hint while it is showing, else null. */
  hint: string | null;
  /** True when this Escape press is (or just was) the browser leaving full screen. */
  escapeOnlyLeavesFullscreen: () => boolean;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function hintSeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.TV_FULLSCREEN_HINT_SEEN) === '1';
  } catch {
    // Storage blocked (private mode): treat as unseen; the cost is a 4-second hint per visit.
    return false;
  }
}

function markHintSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.TV_FULLSCREEN_HINT_SEEN, '1');
  } catch {
    // Storage blocked: the hint simply shows again next time, which is harmless.
  }
}

/** The hint this screen should get, if any. */
function hintFor(): string | null {
  if (fullscreenSupported()) return fullscreenElement() ? null : FULLSCREEN_HINT;
  return window.matchMedia?.(PORTRAIT_PHONE_QUERY).matches ? SIDEWAYS_HINT : null;
}

/** The one-time hint: decided once the deck is `ready`, hidden after 4 s or on entering full screen. */
function useOneTimeHint(ready: boolean): [string | null, (hint: string | null) => void] {
  const [hint, setHint] = useState<string | null>(null);
  const decided = useRef(false);
  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    const text = hintFor();
    if (!text || hintSeen()) return;
    markHintSeen();
    setHint(text);
  }, [ready]);
  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), FULLSCREEN_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);
  return [hint, setHint];
}

export function useTVFullscreen(ready: boolean, keysEnabled: boolean): TVFullscreen {
  const [hint, setHint] = useOneTimeHint(ready);
  const exitedAt = useRef(Number.NEGATIVE_INFINITY);

  // A link opened TV mode and its click is still a valid gesture: use it.
  useEffect(() => { if (hasTransientActivation()) requestFullscreen(); }, []);

  useEffect(() => {
    const onChange = () => {
      if (fullscreenElement()) setHint(null);
      else exitedAt.current = performance.now();
    };
    FULLSCREEN_EVENTS.forEach(name => document.addEventListener(name, onChange));
    return () => FULLSCREEN_EVENTS.forEach(name => document.removeEventListener(name, onChange));
  }, [setHint]);

  useEffect(() => {
    if (!keysEnabled || !fullscreenSupported()) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      toggleFullscreen();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keysEnabled]);

  const escapeOnlyLeavesFullscreen = useCallback(() => {
    // Keydown before the browser's own exit: make sure full screen ends, and stay in TV mode.
    if (fullscreenElement()) { exitFullscreen(); return true; }
    return performance.now() - exitedAt.current < ESCAPE_GRACE_MS;
  }, []);

  return { hint, escapeOnlyLeavesFullscreen };
}
