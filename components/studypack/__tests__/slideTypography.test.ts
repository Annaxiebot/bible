/**
 * slideTypography.test.ts — TV vs portrait-phone type sizes · 字号测试
 *
 * TV sizes are the TYPE_SCALE senior floors (or a step above); portrait-phone
 * sizes are width-based but never below the same px floors.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PORTRAIT_PHONE_QUERY, slideTypography, useSlideTypography, SlideTypography } from '../slideTypography';
import { TYPE_SCALE } from '../principles';

const pxFloor = (size: unknown) => Number(/max\((\d+)px/.exec(String(size))?.[1]);
const ROLES: Array<keyof SlideTypography> = [
  'heading', 'headingTail', 'title', 'body', 'question', 'verse', 'keyPhrase', 'columnLabel', 'lifeMenu',
];

describe('slideTypography', () => {
  const tv = slideTypography(false);
  const portrait = slideTypography(true);

  it('on a TV uses the TYPE_SCALE floors', () => {
    expect(tv.heading.fontSize).toBe(TYPE_SCALE.heading);
    expect(tv.body.fontSize).toBe(TYPE_SCALE.body);
    expect(tv.question.fontSize).toBe(TYPE_SCALE.question);
    expect(tv.columnLabel.fontSize).toBe(TYPE_SCALE.verse);
    expect(tv.lifeMenu.fontSize).toBe(TYPE_SCALE.lifeMenuRow);
  });

  it('scripture on a TV reads at least the verse floor (3.6vh)', () => {
    const vh = (size: unknown) => Number(/([\d.]+)vh/.exec(String(size))?.[1]);
    expect(vh(tv.verse.fontSize)).toBeGreaterThanOrEqual(vh(TYPE_SCALE.verse));
  });

  it('on a portrait phone every role is width-based and keeps the same px floor as on a TV', () => {
    for (const role of ROLES) {
      expect(String(portrait[role].fontSize), role).toMatch(/^max\(\d+px, [\d.]+vw\)$/);
      expect(pxFloor(portrait[role].fontSize), role).toBeGreaterThanOrEqual(pxFloor(tv[role].fontSize));
    }
  });
});

describe('useSlideTypography', () => {
  afterEach(() => vi.restoreAllMocks());

  const mockPortrait = (matches: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query === PORTRAIT_PHONE_QUERY && matches, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as MediaQueryList);

  it('returns the TV sizes on a landscape screen and the phone sizes in portrait', () => {
    mockPortrait(false);
    expect(renderHook(() => useSlideTypography()).result.current).toEqual(slideTypography(false));
    mockPortrait(true);
    expect(renderHook(() => useSlideTypography()).result.current).toEqual(slideTypography(true));
  });
});
