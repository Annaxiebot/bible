/**
 * fakeFullscreen.ts — a Fullscreen API for jsdom (which has none) · 全屏测试替身
 *
 * Mirrors the browser's contract (test harness fidelity): requesting sets
 * document.fullscreenElement and fires "fullscreenchange"; exiting clears it
 * and fires again; `deny` makes the request reject like a refused gesture,
 * leaving the page windowed. uninstall() restores jsdom's "no API" state,
 * which is also what iPhone Safari looks like.
 */
import { vi } from 'vitest';

export interface FakeFullscreen {
  request: ReturnType<typeof vi.fn>;
  exit: ReturnType<typeof vi.fn>;
  /** Simulate the browser leaving full screen by itself (its own Escape handling). */
  browserExit: () => void;
  uninstall: () => void;
}

export function installFakeFullscreen(opts: { deny?: boolean } = {}): FakeFullscreen {
  let element: Element | null = null;
  const change = () => document.dispatchEvent(new Event('fullscreenchange'));
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element });
  Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, get: () => true });
  const request = vi.fn(() => {
    if (opts.deny) return Promise.reject(new TypeError('Permissions check failed'));
    element = document.documentElement;
    change();
    return Promise.resolve();
  });
  const exit = vi.fn(() => {
    element = null;
    change();
    return Promise.resolve();
  });
  Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: request });
  Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
  return {
    request,
    exit,
    browserExit: () => { element = null; change(); },
    uninstall: () => {
      for (const key of ['fullscreenElement', 'fullscreenEnabled', 'exitFullscreen']) {
        delete (document as unknown as Record<string, unknown>)[key];
      }
      delete (document.documentElement as unknown as Record<string, unknown>).requestFullscreen;
    },
  };
}
