/**
 * LandingPrinciples.test.tsx — five pillars from ADR-0003 · 原則測試
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import LandingPrinciples from '../LandingPrinciples';
import {
  PILLARS, PRINCIPLES_EYEBROW, PRINCIPLES_HEADING_ZH, PRINCIPLES_HEADING_EN,
} from '../landingStrings';

describe('LandingPrinciples', () => {
  it('renders exactly five pillars, each with an icon and Chinese-then-English lines', () => {
    render(<LandingPrinciples />);
    expect(PILLARS).toHaveLength(5);
    const items = within(screen.getByTestId('pillars')).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    PILLARS.forEach((pillar, i) => {
      expect(items[i].querySelector('svg')).not.toBeNull();
      expect(within(items[i]).getByText(pillar.zh).nextElementSibling?.textContent).toBe(pillar.en);
    });
  });

  it('follows the eyebrow → heading → line rhythm with the Chinese heading first', () => {
    render(<LandingPrinciples />);
    const section = screen.getByTestId('section-principles');
    expect(section).toHaveAttribute('id', 'principles');
    expect(section).toHaveTextContent(PRINCIPLES_EYEBROW);
    expect(screen.getByRole('heading', { level: 2 }).textContent)
      .toBe(`${PRINCIPLES_HEADING_ZH}${PRINCIPLES_HEADING_EN}`);
  });

  it('every pillar has a Chinese line (CJK present; "AI" and "BSB" are allowed inside it) and an English line', () => {
    for (const pillar of PILLARS) {
      expect(pillar.zh).toMatch(/[一-鿿]/);
      expect(pillar.en).not.toMatch(/[一-鿿]/);
    }
  });
});
