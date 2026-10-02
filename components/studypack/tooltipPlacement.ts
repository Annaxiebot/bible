/**
 * tooltipPlacement.ts — pure placement math for the verse popup.
 *
 * The popup prefers opening above the reference; when there is not enough
 * room it flips below, is clamped horizontally inside the viewport, and its
 * height is capped (≤ half the viewport) so long ranges scroll instead of
 * running off screen.
 */

export interface AnchorRect {
  top: number;
  bottom: number;
  left: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface TooltipPlacement {
  side: 'above' | 'below';
  /** CSS left (px), clamped so the popup never crosses the viewport edges. */
  left: number;
  /** CSS top (px) — set for 'below'; undefined for 'above'. */
  top?: number;
  /** CSS bottom (px, from viewport bottom) — set for 'above'. */
  bottom?: number;
  /** Max popup height (px); content scrolls beyond it. */
  maxHeight: number;
  /** Popup width (px). */
  width: number;
}

/** Gap between the reference and the popup, and minimum edge margin (px). */
export const TOOLTIP_GAP = 8;

/** Height cap as a fraction of the viewport (long ranges scroll). */
export const TOOLTIP_MAX_HEIGHT_RATIO = 0.5;

/** The popup needs at least this much height to be worth placing on a side. */
const MIN_USEFUL_HEIGHT = 120;

/**
 * Compute where the popup opens relative to the viewport (fixed positioning).
 * 'above' anchors via CSS `bottom` so the popup grows upward from the ref
 * without needing its rendered height in advance.
 */
export function placeTooltip(anchor: AnchorRect, viewport: ViewportSize): TooltipPlacement {
  const width = Math.min(Math.round(viewport.width * 0.46), 720);
  const left = Math.min(
    Math.max(anchor.left, TOOLTIP_GAP),
    Math.max(viewport.width - width - TOOLTIP_GAP, TOOLTIP_GAP)
  );
  const cap = Math.round(viewport.height * TOOLTIP_MAX_HEIGHT_RATIO);
  const spaceAbove = anchor.top - 2 * TOOLTIP_GAP;
  const spaceBelow = viewport.height - anchor.bottom - 2 * TOOLTIP_GAP;

  const useAbove = spaceAbove >= Math.min(cap, MIN_USEFUL_HEIGHT) || spaceAbove >= spaceBelow;
  if (useAbove) {
    return {
      side: 'above',
      left,
      bottom: viewport.height - anchor.top + TOOLTIP_GAP,
      maxHeight: Math.min(cap, Math.max(spaceAbove, MIN_USEFUL_HEIGHT)),
      width,
    };
  }
  return {
    side: 'below',
    left,
    top: anchor.bottom + TOOLTIP_GAP,
    maxHeight: Math.min(cap, Math.max(spaceBelow, MIN_USEFUL_HEIGHT)),
    width,
  };
}
