/**
 * RefLinkedText.test.tsx — verse-ref tooltips follow the text they are in.
 *
 * Regression (live session, John 5): after a slide change, the tooltip at
 * the same position showed the PREVIOUS slide's verses — React reused the
 * component (positional key) and its state kept the old resolution. The
 * popup must always show the verses of the reference as written.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { TEST_PACK_PATH } from './fixtures';
import { parseStudyPack } from '../packTypes';
import RefLinkedText from '../RefLinkedText';

const pack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));

function openTooltip(label: string): HTMLElement {
  fireEvent.click(screen.getByText(label));
  return screen.getByRole('tooltip');
}

describe('RefLinkedText', () => {
  it('shows the in-pack verse of the reference', () => {
    render(<RefLinkedText text="见 v.26" pack={pack} />);
    const popup = openTooltip('v.26');
    expect(popup.textContent).toContain('26');
    expect(popup.textContent).toContain(pack.sections.find(s => s.kind === 'scripture')!.verses!.find(v => v.num === 26)!.cuv);
  });

  it('a re-render with a different reference shows the NEW verses, not the old ones', () => {
    const { rerender } = render(<RefLinkedText text="见 v.26" pack={pack} />);
    fireEvent.click(screen.getByText('v.26')); // resolve + open: state now holds v.26
    rerender(<RefLinkedText text="见 vv.31–32" pack={pack} />);
    const popup = openTooltip('vv.31–32');
    const v26 = pack.sections.find(s => s.kind === 'scripture')!.verses!.find(v => v.num === 26)!;
    expect(popup.textContent).not.toContain(v26.cuv);
    const v31 = pack.sections.find(s => s.kind === 'scripture')!.verses!.find(v => v.num === 31)!;
    expect(popup.textContent).toContain(v31.cuv);
  });
});
