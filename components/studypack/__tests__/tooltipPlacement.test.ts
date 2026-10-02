/**
 * tooltipPlacement.test.ts — pure placement math for the verse popup:
 * prefers above, flips below when there is no room above, clamps to the
 * right/left edges, and caps height at half the viewport so long ranges
 * scroll instead of running off screen.
 */
import { describe, it, expect } from 'vitest';
import { placeTooltip, TOOLTIP_GAP, TOOLTIP_MAX_HEIGHT_RATIO } from '../tooltipPlacement';

const TV = { width: 1920, height: 1080 };

describe('placeTooltip', () => {
  it('opens above when there is room, anchored via CSS bottom', () => {
    const p = placeTooltip({ top: 700, bottom: 730, left: 200 }, TV);
    expect(p.side).toBe('above');
    expect(p.bottom).toBe(TV.height - 700 + TOOLTIP_GAP);
    expect(p.top).toBeUndefined();
    expect(p.maxHeight).toBeLessThanOrEqual(TV.height * TOOLTIP_MAX_HEIGHT_RATIO);
    expect(p.left).toBe(200);
  });

  it('flips below when the reference sits near the top edge', () => {
    const p = placeTooltip({ top: 40, bottom: 70, left: 200 }, TV);
    expect(p.side).toBe('below');
    expect(p.top).toBe(70 + TOOLTIP_GAP);
    expect(p.bottom).toBeUndefined();
    // Still fully inside: top + maxHeight within the viewport
    expect(p.top! + p.maxHeight).toBeLessThanOrEqual(TV.height);
  });

  it('clamps horizontally so the popup never crosses the right edge', () => {
    const p = placeTooltip({ top: 700, bottom: 730, left: 1900 }, TV);
    expect(p.left + p.width).toBeLessThanOrEqual(TV.width - TOOLTIP_GAP + 1);
    expect(p.left).toBeGreaterThanOrEqual(TOOLTIP_GAP);
  });

  it('never exceeds half the viewport height (long ranges scroll)', () => {
    const p = placeTooltip({ top: 1000, bottom: 1030, left: 10 }, TV);
    expect(p.maxHeight).toBeLessThanOrEqual(TV.height * TOOLTIP_MAX_HEIGHT_RATIO);
  });

  it('keeps the popup above the fold on a phone-sized viewport', () => {
    const phone = { width: 390, height: 844 };
    const p = placeTooltip({ top: 100, bottom: 130, left: 350 }, phone);
    expect(p.left).toBeGreaterThanOrEqual(TOOLTIP_GAP);
    expect(p.left + p.width).toBeLessThanOrEqual(phone.width - TOOLTIP_GAP + 1);
  });
});
