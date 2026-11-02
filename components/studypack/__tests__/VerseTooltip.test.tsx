/**
 * VerseTooltip.test.tsx — the verse popup opens on hover AND on tap · 经文提示测试
 *
 * Regression (usability review 2026-11-01): an iOS tap fires a synthetic
 * mouseenter (opens) then click on the same tap; the click used to toggle
 * the popup straight back closed, so tapping a dotted verse ref looked
 * dead on phones. The same-tap window (SAME_TAP_MS) keeps it open; a later
 * deliberate click still closes it.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import VerseTooltip from '../VerseTooltip';

const VERSES = [{ num: 26, cuv: '你们看那天上的飞鸟', en: 'Look at the birds of the air' }];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const renderRef = () => render(<VerseTooltip label="v.26" verses={VERSES} />);

describe('VerseTooltip tap behavior', () => {
  it('a phone tap (synthetic mouseenter + click on the same tap) opens the popup and keeps it open', () => {
    renderRef();
    const ref = screen.getByTestId('verse-ref');
    fireEvent.mouseEnter(ref);
    expect(screen.getByTestId('verse-tooltip')).toBeInTheDocument();
    fireEvent.click(ref);   // the same tap's click — must NOT close it
    expect(screen.getByTestId('verse-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('verse-tooltip')).toHaveTextContent('飞鸟');
  });

  it('a later click on the reference closes the open popup (deliberate toggle)', () => {
    renderRef();
    const ref = screen.getByTestId('verse-ref');
    fireEvent.mouseEnter(ref);
    fireEvent.click(ref);
    vi.setSystemTime(Date.now() + 1000);   // well past the same-tap window
    fireEvent.click(ref);
    expect(screen.queryByTestId('verse-tooltip')).toBeNull();
  });

  it('a plain click with no hover (keyboard/assistive, or a mouse that never hovered) opens it', () => {
    renderRef();
    fireEvent.click(screen.getByTestId('verse-ref'));
    expect(screen.getByTestId('verse-tooltip')).toBeInTheDocument();
  });

  it('mouse leave still closes after the delay (hover behavior unchanged)', () => {
    renderRef();
    const ref = screen.getByTestId('verse-ref');
    fireEvent.mouseEnter(ref);
    fireEvent.mouseLeave(ref);
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByTestId('verse-tooltip')).toBeNull();
  });
});
