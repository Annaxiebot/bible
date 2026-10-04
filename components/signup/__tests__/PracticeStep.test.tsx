/**
 * PracticeStep.test.tsx — the multi-select commitment step · 多选操练测试
 *
 * toggleChoice: a tap appends, a second tap removes, any number, tap order
 * kept. The rendered step marks every chosen row (check + gold border +
 * its order), keeps ≥48px targets, and the form's Next stays gated on at
 * least one choice (validatePractice).
 */
import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PracticeStep, { toggleChoice, PracticeChoice } from '../PracticeStep';
import { validatePractice } from '../signupClient';
import { SU_PRACTICE_INTRO, SU_ERR_PRACTICE } from '../signupStrings';
import { SETUP_MIN_TAP_PX } from '../../setup/setupStrings';

const ROWS = [
  { area: '健康 Health', practice: '睡前程序 · Wind-down' },
  { area: '工作 Work', practice: '写下忧虑 · Write it down' },
  { area: '家庭 Family', practice: '一起吃饭 · Eat together' },
  { area: '金钱 Money', practice: '记账 · Track spending' },
];
const EMPTY: PracticeChoice = { practices: [], note: '' };

describe('toggleChoice', () => {
  it('appends in tap order, any number; tapping a chosen row removes only it', () => {
    let v = EMPTY;
    for (const i of [2, 0, 3, 1]) v = toggleChoice(v, ROWS[i]);
    expect(v.practices).toEqual([ROWS[2], ROWS[0], ROWS[3], ROWS[1]]);
    v = toggleChoice(v, ROWS[0]);
    expect(v.practices).toEqual([ROWS[2], ROWS[3], ROWS[1]]);
    v = toggleChoice(v, ROWS[0]);
    expect(v.practices).toEqual([ROWS[2], ROWS[3], ROWS[1], ROWS[0]]);
  });

  it('keeps the note; clearing every row leaves none, which validatePractice refuses', () => {
    let v = toggleChoice({ ...EMPTY, note: '我的' }, ROWS[1]);
    expect(validatePractice(v)).toBeNull();
    v = toggleChoice(v, ROWS[1]);
    expect(v).toEqual({ practices: [], note: '我的' });
    expect(validatePractice(v)).toBe(SU_ERR_PRACTICE);
  });
});

const Harness: React.FC = () => {
  const [value, setValue] = useState<PracticeChoice>(EMPTY);
  return <PracticeStep rows={ROWS} value={value} onChange={setValue} />;
};

describe('PracticeStep', () => {
  it('says "one or more", Chinese first; every chosen row is checked, gold-bordered and numbered in tap order', () => {
    render(<Harness />);
    expect(screen.getByText(SU_PRACTICE_INTRO)).toBeInTheDocument();
    expect(SU_PRACTICE_INTRO).toMatch(/^[一-鿿]/);
    expect(SU_PRACTICE_INTRO).toContain('多项');
    const choices = screen.getAllByTestId('su-practice');
    for (const c of choices) expect(c).toHaveStyle({ minHeight: `${SETUP_MIN_TAP_PX}px` });
    fireEvent.click(choices[3]);
    fireEvent.click(choices[0]);
    fireEvent.click(choices[2]);
    expect(choices.map(c => c.getAttribute('data-chosen'))).toEqual(['2', '', '3', '1']);
    expect(choices.map(c => c.getAttribute('aria-checked'))).toEqual(['true', 'false', 'true', 'true']);
    const checks = screen.getAllByTestId('su-practice-check');
    expect(checks.map(c => c.textContent)).toEqual(['✓', '', '✓', '✓']);
    expect(choices[0].className).toContain('border-amber-400');
    expect(choices[1].className).not.toContain('bg-amber-400/15');
    fireEvent.click(choices[3]);
    expect(choices.map(c => c.getAttribute('data-chosen'))).toEqual(['1', '', '2', '']);
  });
});
