/**
 * fullscreen.ts — the Fullscreen API with Safari's webkit fallback · 全屏
 *
 * TV mode asks the browser for full screen on the click that opens it
 * (editor Preview, leader Present) and on key F. Browsers only grant it
 * inside a user gesture; a refusal is harmless — the deck works in a window —
 * so every request swallows its rejection (R5, commented at each site).
 * iPhone Safari has no element full screen at all: fullscreenSupported() is
 * false there and nothing is requested. The document is injectable so the
 * unit tests can hand in a fake.
 */

type FullscreenDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitFullscreenEnabled?: boolean;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

/** Both event names; Safari < 16.4 only fires the prefixed one. */
export const FULLSCREEN_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

function root(doc: Document): FullscreenRoot {
  return doc.documentElement as FullscreenRoot;
}

export function fullscreenElement(doc: Document = document): Element | null {
  const d = doc as FullscreenDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

/** Can this page go full screen at all? False on iPhone Safari and in iframes without permission. */
export function fullscreenSupported(doc: Document = document): boolean {
  const el = root(doc);
  if (typeof el.requestFullscreen !== 'function' && typeof el.webkitRequestFullscreen !== 'function') return false;
  const d = doc as FullscreenDoc;
  return (d.fullscreenEnabled ?? d.webkitFullscreenEnabled ?? true) !== false;
}

/** Swallow an async refusal (a sync throw is caught by the callers' try). */
function quietly(result: Promise<void> | void): void {
  // Denied (no gesture, iframe policy, user setting): full screen is a nicety, the deck still works windowed.
  if (result && typeof result.catch === 'function') result.catch(() => undefined);
}

/** Ask for full screen on the whole page; no-op when unsupported or already full screen. */
export function requestFullscreen(doc: Document = document): void {
  if (!fullscreenSupported(doc) || fullscreenElement(doc)) return;
  const el = root(doc);
  try {
    quietly(typeof el.requestFullscreen === 'function' ? el.requestFullscreen() : el.webkitRequestFullscreen?.());
  } catch {
    // Older WebKit throws instead of rejecting; same reason as quietly(): optional, windowed is fine.
  }
}

/** Leave full screen if the page is in it. */
export function exitFullscreen(doc: Document = document): void {
  if (!fullscreenElement(doc)) return;
  const d = doc as FullscreenDoc;
  try {
    quietly(typeof d.exitFullscreen === 'function' ? d.exitFullscreen() : d.webkitExitFullscreen?.());
  } catch {
    // Already leaving (the browser handled Escape itself): nothing to undo.
  }
}

export function toggleFullscreen(doc: Document = document): void {
  if (fullscreenElement(doc)) exitFullscreen(doc);
  else requestFullscreen(doc);
}

/**
 * Is the click that brought us here still a valid gesture? (Chromium,
 * Firefox, Safari 16.4+.) Without the API we cannot tell, so we do not try:
 * a request outside a gesture would only be refused.
 */
export function hasTransientActivation(): boolean {
  const nav = navigator as Navigator & { userActivation?: { isActive: boolean } };
  return nav.userActivation?.isActive === true;
}
