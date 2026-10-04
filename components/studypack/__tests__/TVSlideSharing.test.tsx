/**
 * TVSlideSharing.test.tsx — the "last week's sharing" slide · 上周分享幻灯片测试 (ADR-0008)
 *
 * Existing body styling (gold heading, body type scale, theme tokens);
 * 「…」 quote lines in the quieter text token; Chinese-first heading.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TVSlide from '../TVSlide';
import type { Slide } from '../packTypes';
import { TYPE_SCALE } from '../principles';
import { SHARING_HEADING, practiceCountLine } from '../../sharing/sharingStrings';

const BODY = ['散步让焦虑变少', '「晚饭后走一走，心里松了」', practiceCountLine([{ area: '健康 Health', count: 3 }]), '开场问题？'];
const slide: Slide = { kind: 'sharing', heading: SHARING_HEADING, body: BODY };

describe('TVSlide sharing', () => {
  it('shows the Chinese-first heading in the gold token and every body line at the body scale', () => {
    render(<TVSlide slide={slide} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(/^上周操练分享/);
    expect(heading.className).toContain('text-stl-gold');
    for (const line of BODY) expect(screen.getByText(line)).toHaveStyle({ fontSize: TYPE_SCALE.body });
  });

  it('sets 「quote」 lines in the quieter token and the rest in the main text token', () => {
    render(<TVSlide slide={slide} />);
    const quote = screen.getByText(BODY[1]);
    expect(quote.className).toContain('text-stl-text-2');
    expect(quote).toHaveAttribute('data-quote', 'true');
    for (const line of [BODY[0], BODY[2], BODY[3]]) {
      expect(screen.getByText(line).className).toBe('text-stl-text');
      expect(screen.getByText(line)).not.toHaveAttribute('data-quote');
    }
  });

  it('other kinds never quiet a 「…」 line', () => {
    render(<TVSlide slide={{ ...slide, kind: 'context' }} />);
    expect(screen.getByText(BODY[1]).className).toBe('text-stl-text');
  });
});
